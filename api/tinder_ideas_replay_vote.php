<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$data = requireJsonInput();

$roomKey = strtoupper(trim((string)($data['room_key'] ?? '')));
$participantId = (int)($data['participant_id'] ?? 0);

if ($roomKey === '' || $participantId <= 0) {
    respond(['ok' => false, 'error' => 'Brakuje danych pokoju.']);
}

purgeExpiredRooms();

$room = getRoomByKeyOrFail($roomKey);
$participant = getParticipantById($participantId, (int)$room['id']);
if (!$participant) {
    respond(['ok' => false, 'error' => 'Nie znaleziono uczestnika.']);
}

$session = getActiveTinderSession((int)$room['id']);
if (!$session) {
    respond(['ok' => false, 'error' => 'Brak aktywnej rundy do powtórki.']);
}

$db = db();
$db->beginTransaction();
try {
    $deleteStmt = $db->prepare('DELETE FROM tinder_replay_votes WHERE room_id = :room_id AND participant_id = :participant_id AND session_id = :session_id');
    $deleteStmt->execute([
        'room_id' => $room['id'],
        'participant_id' => $participant['id'],
        'session_id' => $session['id'],
    ]);

    $insertStmt = $db->prepare('INSERT INTO tinder_replay_votes (room_id, participant_id, session_id, created_at) VALUES (:room_id, :participant_id, :session_id, CURRENT_TIMESTAMP)');
    $insertStmt->execute([
        'room_id' => $room['id'],
        'participant_id' => $participant['id'],
        'session_id' => $session['id'],
    ]);

    $db->commit();
} catch (Throwable $exception) {
    $db->rollBack();
    respond(['ok' => false, 'error' => 'Nie udało się zapisać zgody na powtórkę.']);
}

respond(['ok' => true]);
