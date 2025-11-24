<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$data = requireJsonInput();

$roomKey = strtoupper(trim((string)($data['room_key'] ?? '')));
$participantId = (int)($data['participant_id'] ?? 0);
$questionId = trim((string)($data['question_id'] ?? ''));
$action = trim((string)($data['action'] ?? ''));

if ($roomKey === '' || $participantId <= 0 || $questionId === '' || $action === '') {
    respond(['ok' => false, 'error' => 'Brak wymaganych danych.']);
}

if (!in_array($action, ['ok', 'skip', 'fav', 'agree', 'disagree'], true)) {
    respond(['ok' => false, 'error' => 'Nieprawidłowa akcja.']);
}

purgeExpiredRooms();

$room = getRoomByKeyOrFail($roomKey);

$stmt = db()->prepare('SELECT id, status FROM participants WHERE id = :id AND room_id = :room_id');
$stmt->execute([
    'id' => $participantId,
    'room_id' => $room['id'],
]);
$participant = $stmt->fetch();
if (!$participant) {
    respond(['ok' => false, 'error' => 'Nie znaleziono uczestnika w tym pokoju.']);
}

if (($participant['status'] ?? '') !== 'active') {
    respond(['ok' => false, 'error' => 'Tylko zatwierdzeni uczestnicy mogą reagować.']);
}

$stmt = db()->prepare('INSERT INTO reactions (room_id, participant_id, question_id, action) VALUES (:room_id, :participant_id, :question_id, :action)
    ON CONFLICT(room_id, participant_id, question_id) DO UPDATE SET action = excluded.action, created_at = CURRENT_TIMESTAMP');
$stmt->execute([
    'room_id' => $room['id'],
    'participant_id' => $participantId,
    'question_id' => $questionId,
    'action' => $action,
]);

respond(['ok' => true]);
