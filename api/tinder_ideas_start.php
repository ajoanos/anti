<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$data = requireJsonInput();

$roomKey = strtoupper(trim((string)($data['room_key'] ?? '')));
$participantId = (int)($data['participant_id'] ?? 0);
$categoryFilter = $data['categories'] ?? [];

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

$pool = listTinderIdeas();
if (empty($pool)) {
    respond(['ok' => false, 'error' => 'Brak pomysłów do wyświetlenia. Sprawdź plik danych.']);
}

$categories = [];
if (is_array($categoryFilter)) {
    $categories = array_filter(array_map('trim', $categoryFilter));
}

$ideas = buildTinderIdeasPayload($categories, 10);
if (empty($ideas)) {
    respond(['ok' => false, 'error' => 'Nie udało się przygotować listy pomysłów z wybranych kategorii.']);
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
        'positions_json' => json_encode($ideas, JSON_UNESCAPED_UNICODE),
        'total_count' => count($ideas),
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
        'total_count' => count($ideas),
        'positions' => $ideas,
    ],
]);
