<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$roomKey = strtoupper(trim((string)($_GET['room_key'] ?? '')));
$participantId = (int)($_GET['participant_id'] ?? 0);

if ($roomKey === '' || $participantId <= 0) {
    respond(['ok' => false, 'error' => 'Brakuje danych pokoju.']);
}

purgeExpiredRooms();

$room = getRoomByKeyOrFail($roomKey);
$participant = getParticipantById($participantId, (int)$room['id']);
if (!$participant) {
    respond(['ok' => false, 'error' => 'Nie znaleziono uczestnika.']);
}

$participants = array_map(static function (array $item): array {
    return [
        'id' => (int)($item['id'] ?? 0),
        'display_name' => (string)($item['display_name'] ?? ''),
    ];
}, getRoomParticipants((int)$room['id']));

$session = getActiveTinderSession((int)$room['id']);
$sessionData = null;
$positions = [];
$replayVotes = [];
$replayReady = false;
if ($session) {
    $positions = is_array($session['positions']) ? $session['positions'] : [];
    $sessionData = [
        'id' => (int)$session['id'],
        'total_count' => (int)$session['total_count'],
        'status' => (string)($session['status'] ?? 'active'),
        'positions' => $positions,
    ];

    $votesStmt = db()->prepare('SELECT participant_id FROM tinder_replay_votes WHERE room_id = :room_id AND session_id = :session_id');
    $votesStmt->execute([
        'room_id' => $room['id'],
        'session_id' => $session['id'],
    ]);
    $replayVotes = array_map('intval', array_column($votesStmt->fetchAll(), 'participant_id'));
    $replayReady = !empty($participants) && count(array_unique($replayVotes)) >= count($participants);
}

$self = [
    'id' => (int)$participant['id'],
    'display_name' => (string)$participant['display_name'],
    'is_host' => (bool)($participant['is_host'] ?? 0),
];

$poolSize = count(listTinderPositions());

$swipesByParticipant = [];
$matches = [];
$selfSwipes = [];
$progressMap = [];
$allFinished = false;

if ($session) {
    $stmt = db()->prepare('SELECT participant_id, position_id, choice FROM tinder_swipes WHERE session_id = :session_id');
    $stmt->execute(['session_id' => $session['id']]);
    $swipesRaw = $stmt->fetchAll();

    foreach ($swipesRaw as $row) {
        $pid = (int)($row['participant_id'] ?? 0);
        $positionId = (string)($row['position_id'] ?? '');
        $choice = (string)($row['choice'] ?? '');
        if ($pid <= 0 || $positionId === '' || $choice === '') {
            continue;
        }
        if (!isset($swipesByParticipant[$pid])) {
            $swipesByParticipant[$pid] = [];
        }
        $swipesByParticipant[$pid][$positionId] = $choice;
    }

    $total = (int)$session['total_count'];
    foreach ($participants as $p) {
        $pid = (int)$p['id'];
        $progressMap[$pid] = isset($swipesByParticipant[$pid]) ? count($swipesByParticipant[$pid]) : 0;
    }

    $selfSwipes = $swipesByParticipant[$self['id']] ?? [];

    $allFinished = !empty($participants) && count($participants) > 1;
    foreach ($participants as $p) {
        $pid = (int)$p['id'];
        $count = $progressMap[$pid] ?? 0;
        if ($total > 0 && $count < $total) {
            $allFinished = false;
            break;
        }
    }

    $likesByPosition = [];
    foreach ($swipesByParticipant as $pid => $swipes) {
        foreach ($swipes as $positionId => $choice) {
            if ($choice !== 'like') {
                continue;
            }
            if (!isset($likesByPosition[$positionId])) {
                $likesByPosition[$positionId] = [];
            }
            $likesByPosition[$positionId][] = $pid;
        }
    }

    $positionMap = [];
    foreach ($positions as $position) {
        $positionMap[$position['id'] ?? ''] = $position;
    }

    foreach ($likesByPosition as $positionId => $list) {
        if (count(array_unique($list)) < 2) {
            continue;
        }
        if (!isset($positionMap[$positionId])) {
            continue;
        }
        $matches[] = $positionMap[$positionId];
    }
}

respond([
    'ok' => true,
    'room_key' => $roomKey,
    'participants' => $participants,
    'self' => $self,
    'session' => $sessionData,
    'self_swipes' => $selfSwipes,
    'progress' => $progressMap,
    'all_finished' => $allFinished,
    'everyone_ready' => count($participants) >= 2,
    'replay_votes' => [
        'participant_ids' => $replayVotes,
        'ready' => $replayReady,
    ],
    'position_pool_size' => $poolSize,
    'matches' => $matches,
]);
