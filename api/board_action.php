<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

const BOARD_TRACK_LENGTH = 24;

$data = requireJsonInput();

$roomKey = strtoupper(trim((string)($data['room_key'] ?? '')));
$participantId = (int)($data['participant_id'] ?? 0);
$action = strtolower(trim((string)($data['action'] ?? '')));

if ($roomKey === '' || $participantId <= 0 || $action === '') {
    respond(['ok' => false, 'error' => 'Brak wymaganych danych.']);
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
    respond(['ok' => false, 'error' => 'Brak uprawnień do wykonywania akcji.']);
}

$participants = getRoomParticipants((int)$room['id']);
if (empty($participants)) {
    respond(['ok' => false, 'error' => 'Brak aktywnych graczy w pokoju.']);
}

$session = fetchBoardState((int)$room['id']);
$state = normalizeBoardState($session['state'], $participants);

switch ($action) {
    case 'roll':
        $state = handleRollAction($state, $participants, $participantId);
        break;
    case 'add_heart':
        $targetId = (int)($data['target_participant_id'] ?? 0);
        $state = handleAddHeartAction($state, $participants, $participantId, $targetId);
        break;
    default:
        respond(['ok' => false, 'error' => 'Nieobsługiwana akcja planszówki.']);
}

saveBoardState((int)$room['id'], $state);

respond([
    'ok' => true,
    'board_state' => $state,
]);

function handleRollAction(array $state, array $participants, int $participantId): array
{
    $participantIds = array_map(static fn (array $item): int => (int)$item['id'], $participants);
    if (!in_array($participantId, $participantIds, true)) {
        respond(['ok' => false, 'error' => 'Nie można wykonać ruchu w tym pokoju.']);
    }

    $currentTurn = (int)($state['current_turn'] ?? 0);
    if ($currentTurn !== 0 && $currentTurn !== $participantId) {
        respond(['ok' => false, 'error' => 'To nie jest Twoja kolej.']);
    }

    $roll = random_int(1, 6);

    $positions = $state['positions'];
    $currentPosition = (int)($positions[$participantId] ?? 1);
    $newPosition = (($currentPosition - 1 + $roll) % BOARD_TRACK_LENGTH) + 1;
    $positions[$participantId] = $newPosition;
    $state['positions'] = $positions;

    $nextTurn = determineNextTurn($participantIds, $participantId);
    $state['current_turn'] = $nextTurn;

    $state['last_roll'] = [
        'value' => $roll,
        'rolled_by' => $participantId,
        'new_position' => $newPosition,
        'rolled_at' => gmdate('c'),
    ];

    $rollerName = findParticipantName($participants, $participantId);
    appendBoardHistory($state, sprintf('%s wyrzucił(a) %d i przesunął(a) pionek na pole %d.', $rollerName, $roll, $newPosition));

    return $state;
}

function handleAddHeartAction(array $state, array $participants, int $participantId, int $targetId): array
{
    if ($targetId <= 0) {
        respond(['ok' => false, 'error' => 'Brak uczestnika, dla którego chcesz dodać serduszko.']);
    }
    $participantIds = array_map(static fn (array $item): int => (int)$item['id'], $participants);
    if (!in_array($targetId, $participantIds, true)) {
        respond(['ok' => false, 'error' => 'Wybrany uczestnik nie jest już aktywny.']);
    }

    $hearts = $state['hearts'];
    $hearts[$targetId] = max(0, (int)($hearts[$targetId] ?? 0)) + 1;
    $state['hearts'] = $hearts;

    $giverName = findParticipantName($participants, $participantId);
    $receiverName = findParticipantName($participants, $targetId);
    appendBoardHistory($state, sprintf('%s dodał(a) serduszko dla %s.', $giverName, $receiverName));

    return $state;
}

function determineNextTurn(array $participantIds, int $currentId): int
{
    if (empty($participantIds)) {
        return 0;
    }
    $count = count($participantIds);
    if ($count === 1) {
        return $participantIds[0];
    }
    $currentIndex = array_search($currentId, $participantIds, true);
    if ($currentIndex === false) {
        return $participantIds[0];
    }
    $nextIndex = ($currentIndex + 1) % $count;
    return $participantIds[$nextIndex];
}

function findParticipantName(array $participants, int $participantId): string
{
    foreach ($participants as $participant) {
        if ((int)$participant['id'] === $participantId) {
            return (string)($participant['display_name'] ?? 'Gracz');
        }
    }
    return 'Gracz';
}

