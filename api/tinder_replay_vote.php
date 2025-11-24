<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$data = requireJsonInput();

$roomKey = strtoupper(trim((string)($data['room_key'] ?? '')));
$participantId = (int)($data['participant_id'] ?? 0);
$sessionId = (int)($data['session_id'] ?? 0);

if ($roomKey === '' || $participantId <= 0 || $sessionId <= 0) {
    respond(['ok' => false, 'error' => 'Brakuje danych pokoju.']);
}

purgeExpiredRooms();

$room = getRoomByKeyOrFail($roomKey);
$participant = getParticipantById($participantId, (int)$room['id']);
if (!$participant) {
    respond(['ok' => false, 'error' => 'Nie znaleziono uczestnika.']);
}

$session = getActiveTinderSession((int)$room['id']);
if (!$session || (int)$session['id'] !== $sessionId) {
    respond(['ok' => false, 'error' => 'Runda została już zakończona.']);
}

$db = db();
$voteStmt = $db->prepare('INSERT INTO tinder_replay_votes (room_id, session_id, participant_id, created_at) VALUES (:room_id, :session_id, :participant_id, CURRENT_TIMESTAMP)
    ON CONFLICT(room_id, session_id, participant_id) DO UPDATE SET created_at = excluded.created_at');
$voteStmt->execute([
    'room_id' => $room['id'],
    'session_id' => $session['id'],
    'participant_id' => $participant['id'],
]);

$votesStmt = $db->prepare('SELECT participant_id FROM tinder_replay_votes WHERE room_id = :room_id AND session_id = :session_id');
$votesStmt->execute([
    'room_id' => $room['id'],
    'session_id' => $session['id'],
]);
$votes = array_map('intval', array_column($votesStmt->fetchAll(), 'participant_id'));

$participants = getRoomParticipants((int)$room['id']);
$ready = !empty($participants) && count(array_unique($votes)) >= count($participants);

respond([
    'ok' => true,
    'replay_votes' => [
        'participant_ids' => $votes,
        'ready' => $ready,
    ],
]);
