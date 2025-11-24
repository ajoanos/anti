<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$data = requireJsonInput();

$roomKey = strtoupper(trim((string)($data['room_key'] ?? '')));
$participantId = (int)($data['participant_id'] ?? 0);

if ($roomKey === '' || $participantId <= 0) {
    respond([
        'ok' => false,
        'error' => 'Brakuje danych pokoju.',
    ]);
}

$room = getRoomByKey($roomKey);
if ($room === null) {
    respond([
        'ok' => false,
        'error' => 'Pokój wygasł lub nie istnieje.',
    ]);
}

$participant = getParticipantById($participantId, (int)$room['id']);
if (!$participant || ($participant['status'] ?? '') !== 'active') {
    respond([
        'ok' => false,
        'error' => 'Uczestnik nie ma aktywnego dostępu do pokoju.',
    ]);
}

$invites = getPlanInvitesForRoom((int)$room['id']);

respond([
    'ok' => true,
    'invites' => array_map(static function (array $invite): array {
        $extras = [];
        if (isset($invite['extras_json'])) {
            $decoded = json_decode((string)$invite['extras_json'], true);
            if (is_array($decoded)) {
                $extras = array_values(array_filter(array_map('trim', $decoded), static fn ($item) => $item !== ''));
            }
        }

        $status = 'pending';
        if (!empty($invite['accepted_at'])) {
            $status = 'accepted';
        } elseif (!empty($invite['declined_at'])) {
            $status = 'declined';
        }

        $sender = trim((string)($invite['sender_display_name'] ?? ''));
        if ($sender === '') {
            $sender = trim((string)($invite['sender_name'] ?? ''));
        }
        if ($sender === '') {
            $sender = trim((string)($invite['sender_email'] ?? ''));
        }

        return [
            'id' => (int)$invite['id'],
            'sender' => $sender !== '' ? $sender : 'Nieznana osoba',
            'mood' => (string)($invite['mood'] ?? ''),
            'closeness' => (string)($invite['closeness'] ?? ''),
            'extras' => $extras,
            'energy' => (string)($invite['energy'] ?? ''),
            'energy_context' => (string)($invite['energy_context'] ?? ''),
            'start_time' => (string)($invite['start_time'] ?? ''),
            'status' => $status,
            'created_at' => (string)($invite['created_at'] ?? ''),
            'accepted_at' => (string)($invite['accepted_at'] ?? ''),
            'declined_at' => (string)($invite['declined_at'] ?? ''),
        ];
    }, $invites),
]);
