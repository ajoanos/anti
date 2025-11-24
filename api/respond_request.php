<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$data = requireJsonInput();

$roomKey = strtoupper(trim((string)($data['room_key'] ?? '')));
$hostId = (int)($data['participant_id'] ?? 0);
$requestId = (int)($data['request_id'] ?? 0);
$decision = strtolower(trim((string)($data['decision'] ?? '')));

if ($roomKey === '' || $hostId <= 0 || $requestId <= 0 || $decision === '') {
    respond(['ok' => false, 'error' => 'Brak wymaganych danych.']);
}

if (!in_array($decision, ['approve', 'reject'], true)) {
    respond(['ok' => false, 'error' => 'Nieprawidłowa decyzja.']);
}

purgeExpiredRooms();

$room = getRoomByKeyOrFail($roomKey);
$host = getParticipantById($hostId, (int)$room['id']);
if (!$host || (int)($host['is_host'] ?? 0) !== 1) {
    respond(['ok' => false, 'error' => 'Tylko gospodarz może zarządzać prośbami.']);
}

if (($host['status'] ?? '') !== 'active') {
    respond(['ok' => false, 'error' => 'Gospodarz musi być aktywny, aby zarządzać prośbami.']);
}

$participant = getParticipantById($requestId, (int)$room['id']);
if (!$participant) {
    respond(['ok' => false, 'error' => 'Nie znaleziono zgłoszenia.']);
}

$newStatus = $decision === 'approve' ? 'active' : 'rejected';
updateParticipantStatus($requestId, (int)$room['id'], $newStatus);

if ($newStatus === 'active') {
    $stmt = db()->prepare('UPDATE participants SET last_seen = :last_seen WHERE id = :id');
    $stmt->execute([
        'last_seen' => gmdate('c'),
        'id' => $requestId,
    ]);
}

respond([
    'ok' => true,
    'new_status' => $newStatus,
]);
