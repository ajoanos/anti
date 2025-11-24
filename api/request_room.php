<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$data = requireJsonInput();
$deck = normalizeDeck($data['deck'] ?? 'default');

purgeExpiredRooms();

$attempts = 0;
$maxAttempts = 20;
$room = null;

while ($attempts < $maxAttempts) {
    $attempts++;
    $roomKey = generateRoomKey();
    $room = createRoom($roomKey, $deck);
    if ($room !== null) {
        break;
    }
}

if (!$room) {
    respond([
        'ok' => false,
        'error' => 'Nie udało się utworzyć pokoju. Spróbuj ponownie za chwilę.',
    ]);
}

respond([
    'ok' => true,
    'room_key' => $room['room_key'],
    'deck' => $room['deck'] ?? $deck,
]);
