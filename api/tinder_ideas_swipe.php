<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$data = requireJsonInput();

$roomKey = strtoupper(trim((string)($data['room_key'] ?? '')));
$participantId = (int)($data['participant_id'] ?? 0);
$positionId = trim((string)($data['position_id'] ?? ''));
$choice = trim((string)($data['choice'] ?? ''));

if ($roomKey === '' || $participantId <= 0 || $positionId === '' || !in_array($choice, ['like', 'dislike'], true)) {
    respond(['ok' => false, 'error' => 'Brakuje danych pokoju lub decyzji.']);
}

purgeExpiredRooms();

$room = getRoomByKeyOrFail($roomKey);
$participant = getParticipantById($participantId, (int)$room['id']);
if (!$participant) {
    respond(['ok' => false, 'error' => 'Nie znaleziono uczestnika.']);
}

$session = getActiveTinderSession((int)$room['id']);
if (!$session) {
    respond(['ok' => false, 'error' => 'Brak aktywnej gry. Poproś gospodarza o rozpoczęcie rundy.']);
}

$positions = is_array($session['positions']) ? $session['positions'] : [];
$validIds = array_map(static function ($item) {
    return (string)($item['id'] ?? '');
}, $positions);

if (!in_array($positionId, $validIds, true)) {
    respond(['ok' => false, 'error' => 'Ten pomysł nie jest częścią obecnej rundy.']);
}

$db = db();
$db->beginTransaction();
try {
    $deleteStmt = $db->prepare('DELETE FROM tinder_swipes WHERE participant_id = :participant_id AND session_id = :session_id AND position_id = :position_id');
    $deleteStmt->execute([
        'participant_id' => $participant['id'],
        'session_id' => $session['id'],
        'position_id' => $positionId,
    ]);

    $insertStmt = $db->prepare('INSERT INTO tinder_swipes (participant_id, session_id, position_id, choice, created_at) VALUES (:participant_id, :session_id, :position_id, :choice, CURRENT_TIMESTAMP)');
    $insertStmt->execute([
        'participant_id' => $participant['id'],
        'session_id' => $session['id'],
        'position_id' => $positionId,
        'choice' => $choice,
    ]);

    $db->commit();
} catch (Throwable $exception) {
    $db->rollBack();
    respond(['ok' => false, 'error' => 'Nie udało się zapisać decyzji. Spróbuj ponownie.']);
}

respond(['ok' => true]);
