<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$data = requireJsonInput();

$roomKey = strtoupper(trim((string)($data['room_key'] ?? '')));
$participantId = (int)($data['participant_id'] ?? 0);
$message = trim((string)($data['message'] ?? ''));

if ($roomKey === '' || $participantId <= 0) {
    respond([
        'ok' => false,
        'error' => 'Brak wymaganych danych.',
    ]);
}

if ($message === '') {
    respond([
        'ok' => false,
        'error' => 'Wiadomość nie może być pusta.',
    ]);
}

if (mb_strlen($message) > 1000) {
    respond([
        'ok' => false,
        'error' => 'Wiadomość jest zbyt długa.',
    ]);
}

$room = getRoomByKeyOrFail($roomKey);
$participant = getParticipantById($participantId, (int)$room['id']);

if (!$participant) {
    respond([
        'ok' => false,
        'error' => 'Nie znaleziono uczestnika.',
    ]);
}

$status = (string)($participant['status'] ?? '');
$isHost = ((int)($participant['is_host'] ?? 0)) === 1;

if (!$isHost && $status !== 'active') {
    respond([
        'ok' => false,
        'error' => 'Nie masz jeszcze dostępu do pokoju.',
    ]);
}

try {
    $encrypted = encryptChatMessage($message, $roomKey);
} catch (Throwable $exception) {
    respond([
        'ok' => false,
        'error' => 'Nie udało się wysłać wiadomości.',
    ]);
}

$stmt = db()->prepare('INSERT INTO chat_messages (room_id, participant_id, ciphertext, iv, tag, created_at)
    VALUES (:room_id, :participant_id, :ciphertext, :iv, :tag, :created_at)');

$stmt->execute([
    'room_id' => (int)$room['id'],
    'participant_id' => $participantId,
    'ciphertext' => $encrypted['ciphertext'],
    'iv' => $encrypted['iv'],
    'tag' => $encrypted['tag'],
    'created_at' => gmdate('Y-m-d H:i:s'),
]);

respond(['ok' => true]);
