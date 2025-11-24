<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$data = requireJsonInput();
$roomKey = strtoupper(trim((string)($data['room_key'] ?? '')));
$categoryFilter = trim((string)($data['category'] ?? ''));
$questionId = trim((string)($data['question_id'] ?? ''));

if ($roomKey === '') {
    respond(['ok' => false, 'error' => 'Brak kodu pokoju.']);
}

purgeExpiredRooms();

$room = getRoomByKeyOrFail($roomKey);
$deck = normalizeDeck($room['deck'] ?? 'default');
$questions = fetchQuestions($deck);
$selectedQuestion = null;

if ($questionId !== '') {
    foreach ($questions as $item) {
        if (($item['id'] ?? '') === $questionId) {
            $selectedQuestion = $item;
            break;
        }
    }
    if ($selectedQuestion === null) {
        respond(['ok' => false, 'error' => 'Nie znaleziono pytania.']);
    }
    if ($categoryFilter !== '' && ($selectedQuestion['category'] ?? '') !== $categoryFilter) {
        respond(['ok' => false, 'error' => 'Wybrane pytanie nie należy do tej kategorii.']);
    }
} else {
    if ($categoryFilter !== '') {
        $questions = array_values(array_filter($questions, static fn($item) => ($item['category'] ?? '') === $categoryFilter));
    }

    $stmt = db()->prepare('SELECT question_id FROM session_questions WHERE room_id = :room_id');
    $stmt->execute(['room_id' => $room['id']]);
    $used = $stmt->fetchAll(PDO::FETCH_COLUMN);

    $available = array_values(array_filter($questions, static fn($item) => !in_array($item['id'] ?? '', $used, true)));

    if (empty($available)) {
        respond(['ok' => false, 'error' => 'Brak nowych pytań w tej kategorii.']);
    }

    $randomIndex = mt_rand(0, count($available) - 1);
    $selectedQuestion = $available[$randomIndex];
}

$stmt = db()->prepare('INSERT INTO session_questions (room_id, question_id) VALUES (:room_id, :question_id)
    ON CONFLICT(room_id, question_id) DO UPDATE SET shown_at = CURRENT_TIMESTAMP');
try {
    $stmt->execute([
        'room_id' => $room['id'],
        'question_id' => $selectedQuestion['id'],
    ]);
} catch (PDOException $e) {
    respond(['ok' => false, 'error' => 'Nie udało się zapisać pytania.']);
}

respond([
    'ok' => true,
    'current_question' => $selectedQuestion,
]);
