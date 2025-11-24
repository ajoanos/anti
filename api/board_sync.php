<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$data = requireJsonInput();

$roomKey = strtoupper(trim((string)($data['room_key'] ?? '')));
$participantId = (int)($data['participant_id'] ?? 0);
$statePayload = $data['state'] ?? null;

if ($roomKey === '' || $participantId <= 0 || !is_array($statePayload)) {
    respond(['ok' => false, 'error' => 'Brak wymaganych danych do zapisania planszówki.']);
}

purgeExpiredRooms();

$room = getRoomByKeyOrFail($roomKey);
$participant = getParticipantById($participantId, (int)$room['id']);
if (!$participant) {
    respond(['ok' => false, 'error' => 'Nie znaleziono uczestnika w tym pokoju.']);
}

$isHost = (int)($participant['is_host'] ?? 0) === 1;
$hasFullAccess = $isHost || ($participant['status'] ?? '') === 'active';
if (!$hasFullAccess) {
    respond(['ok' => false, 'error' => 'Brak uprawnień do aktualizacji planszówki.']);
}

$participants = getRoomParticipants((int)$room['id']);
if (empty($participants)) {
    respond(['ok' => false, 'error' => 'Brak aktywnych graczy w pokoju.']);
}

$normalizedState = normalizeBoardState($statePayload, $participants);

saveBoardState((int)$room['id'], $normalizedState);

respond([
    'ok' => true,
    'board_state' => $normalizedState,
]);
