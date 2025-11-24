<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$data = requireJsonInput();

$roomKey = strtoupper(trim((string)($data['room_key'] ?? '')));
$participantId = (int)($data['participant_id'] ?? 0);
$sessionId = (int)($data['session_id'] ?? 0);
$positionId = trim((string)($data['position_id'] ?? ''));
$choice = strtolower(trim((string)($data['choice'] ?? '')));

if ($roomKey === '' || $participantId <= 0 || $sessionId <= 0 || $positionId === '') {
    respond(['ok' => false, 'error' => 'Brakuje danych do zapisania odpowiedzi.']);
}

if (!in_array($choice, ['like', 'dislike'], true)) {
    respond(['ok' => false, 'error' => 'Niepoprawna decyzja.']);
}

purgeExpiredRooms();

$room = getRoomByKeyOrFail($roomKey);
$participant = getParticipantById($participantId, (int)$room['id']);
if (!$participant) {
    respond(['ok' => false, 'error' => 'Uczestnik nie istnieje.']);
}

$stmt = db()->prepare('SELECT * FROM tinder_sessions WHERE id = :id AND room_id = :room_id');
$stmt->execute([
    'id' => $sessionId,
    'room_id' => $room['id'],
]);
$session = $stmt->fetch();
if (!$session) {
    respond(['ok' => false, 'error' => 'Sesja wygasła lub nie istnieje.']);
}

$positions = json_decode((string)($session['positions_json'] ?? '[]'), true);
if (!is_array($positions) || empty($positions)) {
    respond(['ok' => false, 'error' => 'Sesja nie zawiera pozycji.']);
}

$validPosition = false;
foreach ($positions as $position) {
    if (($position['id'] ?? '') === $positionId) {
        $validPosition = true;
        break;
    }
}

if (!$validPosition) {
    respond(['ok' => false, 'error' => 'Wybrana pozycja nie należy do tej rundy.']);
}

$stmt = db()->prepare('INSERT INTO tinder_swipes (session_id, participant_id, position_id, choice, created_at) VALUES (:session_id, :participant_id, :position_id, :choice, CURRENT_TIMESTAMP)
    ON CONFLICT(session_id, participant_id, position_id) DO UPDATE SET choice = excluded.choice, created_at = CURRENT_TIMESTAMP');
$stmt->execute([
    'session_id' => $sessionId,
    'participant_id' => $participantId,
    'position_id' => $positionId,
    'choice' => $choice,
]);

respond(['ok' => true]);
