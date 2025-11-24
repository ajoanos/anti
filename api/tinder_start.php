<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$data = requireJsonInput();

$roomKey = strtoupper(trim((string)($data['room_key'] ?? '')));
$participantId = (int)($data['participant_id'] ?? 0);
$requestedCount = (int)($data['count'] ?? 0);

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
if (!(bool)($participant['is_host'] ?? 0) && !$session) {
    respond(['ok' => false, 'error' => 'Tylko gospodarz może rozpocząć nową rundę.']);
}

$pool = listTinderPositions();
if (empty($pool)) {
    respond(['ok' => false, 'error' => 'Brak pozycji do wyświetlenia. Dodaj obrazy do folderu.']);
}

$defaultCount = (int)($session['total_count'] ?? 0);
if ($defaultCount <= 0) {
    $defaultCount = 10;
}

$count = (int)$requestedCount;
if ($count <= 0) {
    $count = $defaultCount;
}

$count = max(1, min(100, $count));
$count = min($count, count($pool));

$positions = buildTinderPositionsPayload($count);
if (empty($positions)) {
    respond(['ok' => false, 'error' => 'Nie udało się przygotować listy pozycji.']);
}

$db = db();
$db->beginTransaction();
try {
    $deleteStmt = $db->prepare('DELETE FROM tinder_sessions WHERE room_id = :room_id');
    $deleteStmt->execute(['room_id' => $room['id']]);

    $deleteVotesStmt = $db->prepare('DELETE FROM tinder_replay_votes WHERE room_id = :room_id');
    $deleteVotesStmt->execute(['room_id' => $room['id']]);

    $insertStmt = $db->prepare('INSERT INTO tinder_sessions (room_id, positions_json, total_count, status, updated_at) VALUES (:room_id, :positions_json, :total_count, :status, CURRENT_TIMESTAMP)');
    $insertStmt->execute([
        'room_id' => $room['id'],
        'positions_json' => json_encode($positions, JSON_UNESCAPED_UNICODE),
        'total_count' => count($positions),
        'status' => 'active',
    ]);

    $sessionId = (int)$db->lastInsertId();
    $db->commit();
} catch (Throwable $exception) {
    $db->rollBack();
    respond(['ok' => false, 'error' => 'Nie udało się rozpocząć nowej gry. Spróbuj ponownie.']);
}

respond([
    'ok' => true,
    'session' => [
        'id' => $sessionId,
        'total_count' => count($positions),
        'positions' => $positions,
    ],
]);
