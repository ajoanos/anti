<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$roomKey = strtoupper(trim((string)($_GET['room_key'] ?? '')));
$participantId = (int)($_GET['participant_id'] ?? 0);

if ($roomKey === '' || $participantId <= 0) {
    respond(['ok' => false, 'error' => 'Brak danych pokoju.']);
}

purgeExpiredRooms();

$room = getRoomByKeyOrFail($roomKey);
$participant = getParticipantById($participantId, (int)$room['id']);
if (!$participant) {
    respond(['ok' => false, 'error' => 'Nie znaleziono uczestnika w tym pokoju.']);
}

$isHost = (int)($participant['is_host'] ?? 0) === 1;
$hasFullAccess = $isHost || ($participant['status'] ?? '') === 'active';

$participants = $hasFullAccess ? getRoomParticipants((int)$room['id']) : [];

$pendingRequests = [];
if ($isHost) {
    $pendingRaw = getPendingParticipants((int)$room['id']);
    $pendingRequests = array_map(static function (array $item): array {
        return [
            'id' => (int)($item['id'] ?? 0),
            'display_name' => (string)($item['display_name'] ?? ''),
        ];
    }, $pendingRaw);
}

$boardState = null;
if ($hasFullAccess) {
    $boardSession = fetchBoardState((int)$room['id']);
    $state = normalizeBoardState($boardSession['state'], $participants);
    if ($state !== $boardSession['state']) {
        saveBoardState((int)$room['id'], $state);
    }
    $boardState = $state;
}

respond([
    'ok' => true,
    'participants' => $participants,
    'pending_requests' => $pendingRequests,
    'board_state' => $boardState,
    'self' => [
        'id' => (int)$participant['id'],
        'display_name' => (string)$participant['display_name'],
        'status' => (string)($participant['status'] ?? 'pending'),
        'is_host' => $isHost,
    ],
]);
