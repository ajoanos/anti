<?php

declare(strict_types=1);

if (!defined('BOOTSTRAP_EMIT_JSON')) {
    define('BOOTSTRAP_EMIT_JSON', true);
}

if (BOOTSTRAP_EMIT_JSON) {
    header('Content-Type: application/json; charset=utf-8');
}

define('DB_FILE', __DIR__ . '/../db/data.sqlite');
const ROOM_LIFETIME_SECONDS = 6 * 60 * 60;
const QUESTION_DECKS = [
    'default' => __DIR__ . '/../data/questions.json',
    'never' => __DIR__ . '/../data/nigdy-przenigdy.json',
    'jak-dobrze-mnie-znasz' => __DIR__ . '/../data/jak-dobrze-mnie-znasz.json',
];

if (!function_exists('array_is_list')) {
    function array_is_list(array $array): bool
    {
        if ($array === []) {
            return true;
        }
        $nextKey = 0;
        foreach ($array as $key => $_) {
            if ($key !== $nextKey) {
                return false;
            }
            $nextKey++;
        }
        return true;
    }
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $pdo = new PDO('sqlite:' . DB_FILE, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $pdo->exec('PRAGMA foreign_keys = ON');

    initializeDatabase($pdo);

    return $pdo;
}

function initializeDatabase(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_key TEXT UNIQUE NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deck TEXT NOT NULL DEFAULT "default"
    )');
    addColumnIfMissing($pdo, 'rooms', 'deck', 'TEXT NOT NULL DEFAULT "default"');

    $pdo->exec('CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER NOT NULL,
        display_name TEXT NOT NULL,
        last_seen DATETIME NOT NULL,
        status TEXT NOT NULL DEFAULT \'pending\',
        is_host INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS session_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER NOT NULL,
        question_id TEXT NOT NULL,
        shown_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(room_id, question_id),
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS reactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER NOT NULL,
        participant_id INTEGER NOT NULL,
        question_id TEXT NOT NULL,
        action TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(room_id, participant_id, question_id),
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER NOT NULL,
        participant_id INTEGER NOT NULL,
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        tag TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS board_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER NOT NULL UNIQUE,
        state_json TEXT NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS tinder_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER NOT NULL,
        positions_json TEXT NOT NULL,
        total_count INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT "active",
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS tinder_swipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        participant_id INTEGER NOT NULL,
        position_id TEXT NOT NULL,
        choice TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, participant_id, position_id),
        FOREIGN KEY (session_id) REFERENCES tinder_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS tinder_replay_votes (
        room_id INTEGER NOT NULL,
        session_id INTEGER NOT NULL,
        participant_id INTEGER NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (room_id, session_id, participant_id),
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES tinder_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS plan_invites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER NOT NULL,
        sender_id INTEGER,
        token TEXT NOT NULL UNIQUE,
        sender_email TEXT NOT NULL,
        sender_name TEXT,
        partner_email TEXT NOT NULL,
        mood TEXT,
        closeness TEXT,
        extras_json TEXT,
        energy TEXT,
        energy_context TEXT,
        start_time TEXT,
        plan_link TEXT,
        proposal_link TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        accepted_at DATETIME,
        declined_at DATETIME,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES participants(id) ON DELETE SET NULL
    )');

    addColumnIfMissing($pdo, 'plan_invites', 'plan_link', 'TEXT');
    addColumnIfMissing($pdo, 'plan_invites', 'proposal_link', 'TEXT');
    addColumnIfMissing($pdo, 'plan_invites', 'declined_at', 'DATETIME');
    addColumnIfMissing($pdo, 'plan_invites', 'sender_id', 'INTEGER');
    addColumnIfMissing($pdo, 'plan_invites', 'start_time', 'TEXT');

    $statusAdded = addColumnIfMissing($pdo, 'participants', 'status', "TEXT NOT NULL DEFAULT 'pending'");
    $isHostAdded = addColumnIfMissing($pdo, 'participants', 'is_host', 'INTEGER NOT NULL DEFAULT 0');

    if ($statusAdded) {
        $pdo->exec("UPDATE participants SET status = 'active'");
    } else {
        $pdo->exec("UPDATE participants SET status = 'active' WHERE status IS NULL OR status = ''");
    }

    if ($isHostAdded) {
        $pdo->exec('UPDATE participants SET is_host = 0 WHERE is_host IS NULL');
    }
}

function createPlanInvite(
    int $roomId,
    ?int $senderId,
    string $token,
    string $senderEmail,
    string $partnerEmail,
    string $senderName,
    string $mood,
    string $closeness,
    string $extrasJson,
    string $energy,
    string $energyContext,
    string $startTime,
    string $planLink,
    string $proposalLink
): array {
    $stmt = db()->prepare('INSERT INTO plan_invites (
        room_id,
        sender_id,
        token,
        sender_email,
        sender_name,
        partner_email,
        mood,
        closeness,
        extras_json,
        energy,
        energy_context,
        start_time,
        plan_link,
        proposal_link
    ) VALUES (
        :room_id,
        :sender_id,
        :token,
        :sender_email,
        :sender_name,
        :partner_email,
        :mood,
        :closeness,
        :extras_json,
        :energy,
        :energy_context,
        :start_time,
        :plan_link,
        :proposal_link
    )');

    $stmt->execute([
        'room_id' => $roomId,
        'sender_id' => $senderId,
        'token' => $token,
        'sender_email' => $senderEmail,
        'sender_name' => $senderName,
        'partner_email' => $partnerEmail,
        'mood' => $mood,
        'closeness' => $closeness,
        'extras_json' => $extrasJson,
        'energy' => $energy,
        'energy_context' => $energyContext,
        'start_time' => $startTime,
        'plan_link' => $planLink,
        'proposal_link' => $proposalLink,
    ]);

    $id = (int)db()->lastInsertId();

    $fetch = db()->prepare('SELECT * FROM plan_invites WHERE id = :id');
    $fetch->execute(['id' => $id]);
    return $fetch->fetch() ?: [];
}

function getPlanInviteByToken(string $token): ?array
{
    $stmt = db()->prepare('SELECT * FROM plan_invites WHERE token = :token');
    $stmt->execute(['token' => $token]);
    $invite = $stmt->fetch();
    return $invite ?: null;
}

function getPlanInvitesForRoom(int $roomId): array
{
    $stmt = db()->prepare('SELECT pi.*, p.display_name AS sender_display_name FROM plan_invites pi LEFT JOIN participants p ON p.id = pi.sender_id WHERE pi.room_id = :room_id ORDER BY pi.created_at DESC, pi.id DESC');
    $stmt->execute(['room_id' => $roomId]);
    return $stmt->fetchAll();
}

function getRoomById(int $roomId): ?array
{
    $stmt = db()->prepare('SELECT * FROM rooms WHERE id = :id');
    $stmt->execute(['id' => $roomId]);
    $room = $stmt->fetch();
    return $room ?: null;
}

function markPlanInviteAccepted(int $inviteId): void
{
    $stmt = db()->prepare('UPDATE plan_invites SET accepted_at = :accepted_at WHERE id = :id AND accepted_at IS NULL AND declined_at IS NULL');
    $stmt->execute([
        'accepted_at' => gmdate('c'),
        'id' => $inviteId,
    ]);
}

function markPlanInviteDeclined(int $inviteId): void
{
    $stmt = db()->prepare('UPDATE plan_invites SET declined_at = :declined_at WHERE id = :id AND declined_at IS NULL AND accepted_at IS NULL');
    $stmt->execute([
        'declined_at' => gmdate('c'),
        'id' => $inviteId,
    ]);
}

function addColumnIfMissing(PDO $pdo, string $table, string $column, string $definition): bool
{
    if (!preg_match('/^[A-Za-z0-9_]+$/', $table) || !preg_match('/^[A-Za-z0-9_]+$/', $column)) {
        return false;
    }

    $stmt = $pdo->query('PRAGMA table_info(' . $table . ')');
    while ($info = $stmt->fetch(PDO::FETCH_ASSOC)) {
        if (($info['name'] ?? '') === $column) {
            return false;
        }
    }

    $pdo->exec(sprintf('ALTER TABLE %s ADD COLUMN %s %s', $table, $column, $definition));
    return true;
}

function respond(array $data): void
{
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function normalizeDeck(?string $deck): string
{
    $deck = strtolower(trim((string)$deck));
    if (isset(QUESTION_DECKS[$deck])) {
        return $deck;
    }
    return 'default';
}

function fetchQuestions(string $deck = 'default'): array
{
    $deck = normalizeDeck($deck);
    $file = QUESTION_DECKS[$deck] ?? QUESTION_DECKS['default'];
    if (!file_exists($file)) {
        return [];
    }
    $content = file_get_contents($file);
    if ($content === false) {
        return [];
    }
    $decoded = json_decode($content, true);
    return is_array($decoded) ? $decoded : [];
}

function purgeExpiredRooms(): void
{
    $stmt = db()->query('SELECT id, room_key, created_at FROM rooms');
    $idsToDelete = [];
    while ($room = $stmt->fetch()) {
        if (isRoomExpired($room)) {
            $idsToDelete[] = (int)$room['id'];
        }
    }
    if (empty($idsToDelete)) {
        return;
    }
    $deleteStmt = db()->prepare('DELETE FROM rooms WHERE id = :id');
    foreach ($idsToDelete as $id) {
        $deleteStmt->execute(['id' => $id]);
    }
}

function isRoomExpired(array $room): bool
{
    $createdAtRaw = $room['created_at'] ?? '';
    if ($createdAtRaw === '') {
        return false;
    }
    try {
        $createdAt = new DateTimeImmutable($createdAtRaw, new DateTimeZone('UTC'));
    } catch (Exception $exception) {
        return false;
    }
    $expiresAt = $createdAt->modify('+' . ROOM_LIFETIME_SECONDS . ' seconds');
    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    return $expiresAt < $now;
}

function getRoomByKey(string $roomKey): ?array
{
    $roomKey = strtoupper($roomKey);
    $stmt = db()->prepare('SELECT * FROM rooms WHERE room_key = :room_key');
    $stmt->execute(['room_key' => $roomKey]);
    $room = $stmt->fetch();
    if (!$room) {
        return null;
    }
    if (isRoomExpired($room)) {
        $deleteStmt = db()->prepare('DELETE FROM rooms WHERE id = :id');
        $deleteStmt->execute(['id' => $room['id']]);
        return null;
    }
    return $room;
}

function deriveChatKey(string $roomKey): string
{
    return hash('sha256', 'momenty-chat:' . strtoupper($roomKey), true);
}

function encryptChatMessage(string $message, string $roomKey): array
{
    $key = deriveChatKey($roomKey);
    $iv = random_bytes(12);
    $tag = '';
    $ciphertext = openssl_encrypt($message, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    if ($ciphertext === false) {
        throw new RuntimeException('Nie udało się zaszyfrować wiadomości.');
    }
    return [
        'ciphertext' => base64_encode($ciphertext),
        'iv' => base64_encode($iv),
        'tag' => base64_encode($tag),
    ];
}

function decryptChatMessage(string $ciphertext, string $iv, string $tag, string $roomKey): ?string
{
    $key = deriveChatKey($roomKey);
    $cipherRaw = base64_decode($ciphertext, true);
    $ivRaw = base64_decode($iv, true);
    $tagRaw = base64_decode($tag, true);

    if ($cipherRaw === false || $ivRaw === false || $tagRaw === false) {
        return null;
    }

    $plain = openssl_decrypt($cipherRaw, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $ivRaw, $tagRaw);

    return $plain === false ? null : $plain;
}

function fetchChatMessages(int $roomId, string $roomKey, int $limit = 50): array
{
    $stmt = db()->prepare('SELECT m.id, m.participant_id, m.ciphertext, m.iv, m.tag, m.created_at, p.display_name
        FROM chat_messages m
        JOIN participants p ON p.id = m.participant_id
        WHERE m.room_id = :room_id
        ORDER BY m.id DESC
        LIMIT :limit');
    $stmt->bindValue(':room_id', $roomId, PDO::PARAM_INT);
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    $rows = $stmt->fetchAll();
    if (!$rows) {
        return [];
    }

    $messages = [];
    foreach (array_reverse($rows) as $row) {
        $text = decryptChatMessage((string)$row['ciphertext'], (string)$row['iv'], (string)$row['tag'], $roomKey);
        if ($text === null) {
            continue;
        }
        $messages[] = [
            'id' => (int)($row['id'] ?? 0),
            'participant_id' => (int)($row['participant_id'] ?? 0),
            'display_name' => (string)($row['display_name'] ?? ''),
            'text' => $text,
            'created_at' => (string)($row['created_at'] ?? ''),
        ];
    }

    return $messages;
}

function generateRoomKey(int $length = 6): string
{
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $alphabetLength = strlen($alphabet);
    $characters = [];
    for ($i = 0; $i < $length; $i++) {
        $index = random_int(0, $alphabetLength - 1);
        $characters[] = $alphabet[$index];
    }
    return implode('', $characters);
}

function createRoom(string $roomKey, string $deck = 'default'): ?array
{
    $roomKey = strtoupper($roomKey);
    if (getRoomByKey($roomKey)) {
        return null;
    }
    $stmt = db()->prepare('INSERT INTO rooms (room_key, created_at, deck) VALUES (:room_key, :created_at, :deck)');
    $stmt->execute([
        'room_key' => $roomKey,
        'created_at' => gmdate('Y-m-d H:i:s'),
        'deck' => normalizeDeck($deck),
    ]);
    return getRoomByKey($roomKey);
}

function ensureParticipant(int $roomId, string $displayName, bool $isHost = false, bool $forceActive = false): array
{
    $stmt = db()->prepare('SELECT * FROM participants WHERE room_id = :room_id AND display_name = :display_name');
    $stmt->execute([
        'room_id' => $roomId,
        'display_name' => $displayName,
    ]);
    $participant = $stmt->fetch();
    if ($participant) {
        $participantId = (int)$participant['id'];
        $needsRefresh = false;

        if ($isHost && (int)($participant['is_host'] ?? 0) !== 1) {
            $update = db()->prepare('UPDATE participants SET is_host = 1, status = :status WHERE id = :id');
            $update->execute([
                'status' => 'active',
                'id' => $participantId,
            ]);
            $needsRefresh = true;
        }

        if ($forceActive && ($participant['status'] ?? '') !== 'active') {
            $update = db()->prepare('UPDATE participants SET status = :status WHERE id = :id');
            $update->execute([
                'status' => 'active',
                'id' => $participantId,
            ]);
            $needsRefresh = true;
        } elseif (!$isHost && !$forceActive && ($participant['status'] ?? '') === 'rejected') {
            $update = db()->prepare('UPDATE participants SET status = :status WHERE id = :id');
            $update->execute([
                'status' => 'pending',
                'id' => $participantId,
            ]);
            $needsRefresh = true;
        }

        if ($needsRefresh) {
            $participant = getParticipantById($participantId, $roomId) ?: $participant;
        }

        return $participant;
    }
    $stmt = db()->prepare('INSERT INTO participants (room_id, display_name, last_seen, status, is_host) VALUES (:room_id, :display_name, :last_seen, :status, :is_host)');
    $stmt->execute([
        'room_id' => $roomId,
        'display_name' => $displayName,
        'last_seen' => gmdate('c'),
        'status' => ($isHost || $forceActive) ? 'active' : 'pending',
        'is_host' => $isHost ? 1 : 0,
    ]);
    $participantId = (int)db()->lastInsertId();
    $stmt = db()->prepare('SELECT * FROM participants WHERE id = :id');
    $stmt->execute(['id' => $participantId]);
    return $stmt->fetch();
}

function requireJsonInput(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond([
            'ok' => false,
            'error' => 'Niepoprawny JSON',
        ]);
    }
    return $data;
}

function getRoomParticipants(int $roomId): array
{
    $stmt = db()->prepare('SELECT id, display_name, last_seen FROM participants WHERE room_id = :room_id AND status = :status ORDER BY display_name');
    $stmt->execute([
        'room_id' => $roomId,
        'status' => 'active',
    ]);
    return $stmt->fetchAll();
}

function getPendingParticipants(int $roomId): array
{
    $stmt = db()->prepare('SELECT id, display_name, last_seen FROM participants WHERE room_id = :room_id AND status = :status ORDER BY id');
    $stmt->execute([
        'room_id' => $roomId,
        'status' => 'pending',
    ]);
    return $stmt->fetchAll();
}

function getParticipantById(int $participantId, int $roomId): ?array
{
    $stmt = db()->prepare('SELECT * FROM participants WHERE id = :id AND room_id = :room_id');
    $stmt->execute([
        'id' => $participantId,
        'room_id' => $roomId,
    ]);
    $participant = $stmt->fetch();
    return $participant ?: null;
}

function updateParticipantStatus(int $participantId, int $roomId, string $status): void
{
    $stmt = db()->prepare('UPDATE participants SET status = :status WHERE id = :id AND room_id = :room_id');
    $stmt->execute([
        'status' => $status,
        'id' => $participantId,
        'room_id' => $roomId,
    ]);
}

function getLatestQuestion(int $roomId, string $deck = 'default'): ?array
{
    $stmt = db()->prepare('SELECT question_id FROM session_questions WHERE room_id = :room_id ORDER BY shown_at DESC LIMIT 1');
    $stmt->execute(['room_id' => $roomId]);
    $last = $stmt->fetchColumn();
    if (!$last) {
        return null;
    }
    foreach (fetchQuestions($deck) as $question) {
        if (($question['id'] ?? null) === $last) {
            return $question;
        }
    }
    return null;
}

function getRoomByKeyOrFail(string $roomKey): array
{
    $room = getRoomByKey($roomKey);
    if (!$room) {
        respond(['ok' => false, 'error' => 'Pokój nie istnieje lub wygasł.']);
    }
    return $room;
}

const BOARD_MAX_INDEX = 38;

const TINDER_POSITIONS_PATH = '/../obrazy/zdrapki';

function listTinderPositions(): array
{
    static $cache = null;
    if (is_array($cache)) {
        return $cache;
    }

    $directory = realpath(__DIR__ . TINDER_POSITIONS_PATH);
    if ($directory === false || !is_dir($directory)) {
        $cache = [];
        return $cache;
    }

    $allowedExtensions = ['png', 'jpg', 'jpeg', 'webp'];
    $entries = scandir($directory);
    if ($entries === false) {
        $cache = [];
        return $cache;
    }

    $files = [];
    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }
        $path = $directory . DIRECTORY_SEPARATOR . $entry;
        if (!is_file($path)) {
            continue;
        }
        $extension = strtolower(pathinfo($entry, PATHINFO_EXTENSION));
        if (!in_array($extension, $allowedExtensions, true)) {
            continue;
        }
        $files[] = 'obrazy/zdrapki/' . $entry;
    }

    natsort($files);
    $cache = array_values($files);
    return $cache;
}

function normalizeTinderPositionId(string $path): string
{
    $filename = basename($path);
    $id = preg_replace('/\.[^.]+$/', '', $filename);
    $id = strtolower((string)$id);
    $id = preg_replace('/[^a-z0-9]+/', '-', (string)$id);
    return trim($id ?: $filename);
}

function formatTinderPositionTitle(string $path): string
{
    $filename = basename($path);
    $id = preg_replace('/\.[^.]+$/', '', $filename) ?: $filename;
    $clean = preg_replace('/[_-]+/', ' ', (string)$id);
    $clean = trim((string)$clean);
    if ($clean === '') {
        return 'Pozycja';
    }
    $parts = preg_split('/\s+/', $clean) ?: [];
    $parts = array_map(static function ($word) {
        $word = (string)$word;
        if ($word === '') {
            return $word;
        }
        return mb_strtoupper(mb_substr($word, 0, 1)) . mb_substr($word, 1);
    }, $parts);
    return implode(' ', $parts);
}

function buildTinderPositionsPayload(int $count): array
{
    $files = listTinderPositions();
    if (empty($files)) {
        return [];
    }

    if ($count > count($files)) {
        $count = count($files);
    }

    shuffle($files);
    $selected = array_slice($files, 0, max(1, $count));
    $result = [];
    foreach ($selected as $file) {
        $result[] = [
            'id' => normalizeTinderPositionId($file),
            'title' => formatTinderPositionTitle($file),
            'image' => $file,
        ];
    }
    return $result;
}

function getActiveTinderSession(int $roomId): ?array
{
    $stmt = db()->prepare('SELECT * FROM tinder_sessions WHERE room_id = :room_id ORDER BY id DESC LIMIT 1');
    $stmt->execute(['room_id' => $roomId]);
    $session = $stmt->fetch();
    if (!$session) {
        return null;
    }
    $session['positions'] = json_decode((string)($session['positions_json'] ?? '[]'), true);
    if (!is_array($session['positions'])) {
        $session['positions'] = [];
    }
    return $session;
}

const TRIO_ALLOWED_BOARD_SIZES = [3, 4];
const TRIO_DEFAULT_BOARD_SIZE = 4;

function defaultBoardState(): array
{
    return [
        'players' => [],
        'turnOrder' => [],
        'positions' => [],
        'hearts' => [],
        'jail' => [],
        'notice' => '',
        'currentTurn' => null,
        'awaitingConfirmation' => null,
        'nextTurn' => null,
        'lastRoll' => null,
        'focusField' => 0,
        'finished' => false,
        'winnerId' => null,
        'version' => 0,
        'history' => [],
        'trioChallenge' => defaultTrioChallengeState(),
    ];
}

function defaultTrioChallengeState(): array
{
    $size = TRIO_DEFAULT_BOARD_SIZE;

    return [
        'boardSize' => $size,
        'board' => array_fill(0, trioBoardCellCount($size), ''),
        'currentSymbol' => randomTrioStartingSymbol(),
        'assignments' => ['x' => null, 'o' => null],
        'winner' => null,
        'winningLine' => [],
        'challenge' => null,
        'drawChallenges' => [],
        'mode' => 'soft',
        'round' => 1,
        'lastMoveBy' => null,
        'updatedAt' => '',
    ];
}

function sanitizeTrioBoardSize($value): int
{
    $size = (int)$value;

    return in_array($size, TRIO_ALLOWED_BOARD_SIZES, true) ? $size : TRIO_DEFAULT_BOARD_SIZE;
}

function trioBoardCellCount($size): int
{
    $sanitized = sanitizeTrioBoardSize($size);

    return $sanitized * $sanitized;
}

function randomTrioStartingSymbol(): string
{
    try {
        return random_int(0, 1) === 0 ? 'X' : 'O';
    } catch (Exception $exception) {
        return mt_rand(0, 1) === 0 ? 'X' : 'O';
    }
}

function getBoardSession(int $roomId): ?array
{
    $stmt = db()->prepare('SELECT state_json, updated_at FROM board_sessions WHERE room_id = :room_id');
    $stmt->execute(['room_id' => $roomId]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    $decoded = json_decode((string)($row['state_json'] ?? ''), true);
    if (!is_array($decoded)) {
        $decoded = defaultBoardState();
    }
    return [
        'state' => $decoded,
        'updated_at' => (string)($row['updated_at'] ?? ''),
    ];
}

function fetchBoardState(int $roomId): array
{
    $session = getBoardSession($roomId);
    if ($session !== null) {
        return $session;
    }
    $state = defaultBoardState();
    saveBoardState($roomId, $state);
    return [
        'state' => $state,
        'updated_at' => gmdate('c'),
    ];
}

function saveBoardState(int $roomId, array $state): void
{
    $json = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('Nie udało się zapisać stanu planszówki.');
    }
    $stmt = db()->prepare('INSERT INTO board_sessions (room_id, state_json, updated_at)
        VALUES (:room_id, :state_json, :updated_at)
        ON CONFLICT(room_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at');
    $stmt->execute([
        'room_id' => $roomId,
        'state_json' => $json,
        'updated_at' => gmdate('c'),
    ]);
}

function normalizeBoardState(array $state, array $participants): array
{
    $normalized = defaultBoardState();

    $participantMap = [];
    foreach ($participants as $participant) {
        $id = (string)((int)($participant['id'] ?? 0));
        if ($id === '0') {
            continue;
        }
        $name = trim((string)($participant['display_name'] ?? ''));
        if ($name === '') {
            $name = 'Gracz';
        }
        $participantMap[$id] = [
            'id' => $id,
            'name' => $name,
        ];
    }

    $incomingPlayers = [];
    if (isset($state['players']) && is_array($state['players'])) {
        foreach ($state['players'] as $key => $value) {
            if (!is_array($value)) {
                continue;
            }
            $id = (string)($value['id'] ?? $key);
            if ($id === '' || $id === '0') {
                continue;
            }
            $incomingPlayers[$id] = [
                'id' => $id,
                'name' => trim((string)($value['name'] ?? '')),
                'color' => trim((string)($value['color'] ?? '')),
            ];
        }
    }

    $usedColors = [];
    foreach ($incomingPlayers as $player) {
        if ($player['color'] !== '' && !in_array($player['color'], $usedColors, true)) {
            $usedColors[] = $player['color'];
        }
    }

    foreach ($participantMap as $participantKey => $participant) {
        $id = (string)$participantKey;
        $existing = $incomingPlayers[$id] ?? null;
        $color = $existing['color'] ?? pickBoardColor($usedColors);
        if (!in_array($color, $usedColors, true)) {
            $usedColors[] = $color;
        }
        $normalized['players'][$id] = [
            'id' => $id,
            'name' => $participant['name'] !== '' ? $participant['name'] : ($existing['name'] ?? 'Gracz'),
            'color' => $color,
        ];
    }

    $desiredOrder = isset($state['turnOrder']) && is_array($state['turnOrder']) ? $state['turnOrder'] : [];
    $turnOrder = [];
    foreach ($desiredOrder as $value) {
        $id = (string)$value;
        if ($id !== '' && isset($normalized['players'][$id]) && !in_array($id, $turnOrder, true)) {
            $turnOrder[] = $id;
        }
    }
    foreach (array_keys($normalized['players']) as $playerKey) {
        $id = (string)$playerKey;
        if (!in_array($id, $turnOrder, true)) {
            $turnOrder[] = $id;
        }
    }
    $normalized['turnOrder'] = $turnOrder;

    if (isset($state['positions']) && is_array($state['positions'])) {
        foreach ($state['positions'] as $key => $value) {
            $id = (string)$key;
            if (!isset($normalized['players'][$id])) {
                continue;
            }
            $normalized['positions'][$id] = clampBoardIndexValue($value);
        }
    }
    foreach ($normalized['players'] as $playerKey => $_) {
        $id = (string)$playerKey;
        if (!array_key_exists($id, $normalized['positions'])) {
            $normalized['positions'][$id] = 0;
        }
    }

    if (isset($state['hearts']) && is_array($state['hearts'])) {
        foreach ($state['hearts'] as $key => $value) {
            $id = (string)$key;
            if (!isset($normalized['players'][$id])) {
                continue;
            }
            $normalized['hearts'][$id] = clampNonNegativeInt($value);
        }
    }
    foreach ($normalized['players'] as $playerKey => $_) {
        $id = (string)$playerKey;
        if (!array_key_exists($id, $normalized['hearts'])) {
            $normalized['hearts'][$id] = 0;
        }
    }

    if (isset($state['jail']) && is_array($state['jail'])) {
        foreach ($state['jail'] as $key => $value) {
            $id = (string)$key;
            if (!isset($normalized['players'][$id])) {
                continue;
            }
            $normalized['jail'][$id] = clampNonNegativeInt($value);
        }
    }
    foreach ($normalized['players'] as $playerKey => $_) {
        $id = (string)$playerKey;
        if (!array_key_exists($id, $normalized['jail'])) {
            $normalized['jail'][$id] = 0;
        }
    }

    $normalized['notice'] = isset($state['notice']) && is_string($state['notice']) ? $state['notice'] : '';
    $normalized['focusField'] = clampBoardIndexValue($state['focusField'] ?? 0);
    $normalized['finished'] = !empty($state['finished']);
    $normalized['version'] = isset($state['version']) ? (int)$state['version'] : 0;

    $currentTurn = isset($state['currentTurn']) ? (string)$state['currentTurn'] : '';
    if ($currentTurn !== '' && isset($normalized['players'][$currentTurn])) {
        $normalized['currentTurn'] = $currentTurn;
    } else {
        $normalized['currentTurn'] = $turnOrder[0] ?? null;
    }

    $nextTurn = isset($state['nextTurn']) ? (string)$state['nextTurn'] : '';
    $normalized['nextTurn'] = ($nextTurn !== '' && isset($normalized['players'][$nextTurn])) ? $nextTurn : null;

    if (isset($state['awaitingConfirmation']) && is_array($state['awaitingConfirmation'])) {
        $awaitingPlayer = (string)($state['awaitingConfirmation']['playerId'] ?? '');
        $awaitingField = clampBoardIndexValue($state['awaitingConfirmation']['fieldIndex'] ?? 0);
        if ($awaitingPlayer !== '' && isset($normalized['players'][$awaitingPlayer])) {
            $mode = (string)($state['awaitingConfirmation']['mode'] ?? '');
            $mode = $mode === 'safe' ? 'safe' : 'task';

            $record = [
                'playerId' => $awaitingPlayer,
                'fieldIndex' => $awaitingField,
                'mode' => $mode,
            ];

            $reviewerId = (string)($state['awaitingConfirmation']['reviewerId'] ?? '');
            if ($reviewerId !== '' && isset($normalized['players'][$reviewerId])) {
                $record['reviewerId'] = $reviewerId;
            }

            $normalized['awaitingConfirmation'] = $record;
        }
    }

    if (isset($state['lastRoll']) && is_array($state['lastRoll'])) {
        $rollPlayer = (string)($state['lastRoll']['playerId'] ?? '');
        if ($rollPlayer !== '' && isset($normalized['players'][$rollPlayer])) {
            $roll = [
                'playerId' => $rollPlayer,
                'value' => clampDiceValueInt($state['lastRoll']['value'] ?? 0),
                'from' => clampBoardIndexValue($state['lastRoll']['from'] ?? 0),
                'to' => clampBoardIndexValue($state['lastRoll']['to'] ?? 0),
            ];

            $rollId = (string)($state['lastRoll']['id'] ?? '');
            if ($rollId !== '') {
                $roll['id'] = $rollId;
            }

            $createdAt = (string)($state['lastRoll']['createdAt'] ?? '');
            if ($createdAt !== '') {
                $roll['createdAt'] = $createdAt;
            }

            $normalized['lastRoll'] = $roll;
        }
    }

    $winnerId = isset($state['winnerId']) ? (string)$state['winnerId'] : '';
    $normalized['winnerId'] = ($winnerId !== '' && isset($normalized['players'][$winnerId])) ? $winnerId : null;

    if (isset($state['history']) && is_array($state['history'])) {
        $history = [];
        foreach ($state['history'] as $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $message = trim((string)($entry['message'] ?? ''));
            if ($message === '') {
                continue;
            }
            $history[] = [
                'message' => $message,
                'timestamp' => (string)($entry['timestamp'] ?? gmdate('c')),
            ];
        }
        if (count($history) > 40) {
            $history = array_slice($history, -40);
        }
        $normalized['history'] = $history;
    }

    $normalized['trioChallenge'] = normalizeTrioChallengeState($state['trioChallenge'] ?? null, $participants);

    return $normalized;
}

function normalizeTrioChallengeState($state, array $participants): array
{
    $normalized = defaultTrioChallengeState();
    if (!is_array($state)) {
        return $normalized;
    }

    $boardSize = sanitizeTrioBoardSize($state['boardSize'] ?? null);
    $cellCount = trioBoardCellCount($boardSize);
    $normalized['boardSize'] = $boardSize;

    $board = array_fill(0, $cellCount, '');
    if (isset($state['board']) && is_array($state['board'])) {
        foreach ($state['board'] as $index => $value) {
            $idx = (int)$index;
            if ($idx < 0 || $idx >= $cellCount) {
                continue;
            }
            $symbol = strtoupper((string)$value);
            if ($symbol !== 'X' && $symbol !== 'O') {
                $symbol = '';
            }
            $board[$idx] = $symbol;
        }
    }
    $normalized['board'] = $board;

    $currentSymbol = strtoupper((string)($state['currentSymbol'] ?? 'X'));
    $normalized['currentSymbol'] = $currentSymbol === 'O' ? 'O' : 'X';

    $participantIds = array_map(static function ($item): string {
        return (string)((int)($item['id'] ?? 0));
    }, $participants);

    $assignments = ['x' => null, 'o' => null];
    if (isset($state['assignments']) && is_array($state['assignments'])) {
        foreach (['x', 'o'] as $slot) {
            $value = (string)($state['assignments'][$slot] ?? '');
            $assignments[$slot] = ($value !== '' && in_array($value, $participantIds, true)) ? $value : null;
        }
    }
    $normalized['assignments'] = $assignments;

    $winner = strtolower((string)($state['winner'] ?? ''));
    if ($winner === 'draw') {
        $normalized['winner'] = 'draw';
    } elseif ($winner === 'x' || $winner === 'o') {
        $normalized['winner'] = strtoupper($winner);
    } else {
        $normalized['winner'] = null;
    }

    $winningLine = [];
    if (isset($state['winningLine']) && is_array($state['winningLine'])) {
        foreach ($state['winningLine'] as $value) {
            $index = (int)$value;
            if ($index >= 0 && $index < $cellCount) {
                $winningLine[] = $index;
            }
        }
    }
    $normalized['winningLine'] = $winningLine;

    $normalized['challenge'] = normalizeTrioChallengePayload($state['challenge'] ?? null);

    $drawChallenges = [];
    if (isset($state['drawChallenges']) && is_array($state['drawChallenges'])) {
        foreach ($state['drawChallenges'] as $value) {
            $text = trim((string)$value);
            if ($text !== '') {
                $drawChallenges[] = $text;
            }
            if (count($drawChallenges) >= 2) {
                break;
            }
        }
    }
    $normalized['drawChallenges'] = $drawChallenges;

    $mode = strtolower((string)($state['mode'] ?? 'soft'));
    $normalized['mode'] = $mode === 'extreme' ? 'extreme' : 'soft';

    $round = (int)($state['round'] ?? 1);
    $normalized['round'] = $round > 0 ? $round : 1;

    $lastMove = (string)($state['lastMoveBy'] ?? '');
    $normalized['lastMoveBy'] = ($lastMove !== '' && in_array($lastMove, $participantIds, true)) ? $lastMove : null;

    $normalized['updatedAt'] = (string)($state['updatedAt'] ?? '');

    return $normalized;
}

function normalizeTrioChallengePayload($value): ?array
{
    if (!is_array($value)) {
        return null;
    }
    $type = ($value['type'] ?? '') === 'draw' ? 'draw' : 'single';
    $assignedSymbol = strtoupper((string)($value['assignedSymbol'] ?? 'O'));
    if ($assignedSymbol !== 'O') {
        $assignedSymbol = 'X';
    }
    $tasks = [];
    if (isset($value['tasks']) && is_array($value['tasks'])) {
        foreach ($value['tasks'] as $task) {
            $text = trim((string)$task);
            if ($text !== '') {
                $tasks[] = $text;
            }
            if ($type === 'single' && count($tasks) >= 1) {
                break;
            }
            if ($type === 'draw' && count($tasks) >= 2) {
                break;
            }
        }
    }
    if (empty($tasks)) {
        return null;
    }
    return [
        'type' => $type,
        'assignedSymbol' => $assignedSymbol,
        'tasks' => $tasks,
    ];
}

function clampBoardIndexValue($value): int
{
    if (is_numeric($value)) {
        $numeric = (int)$value;
    } else {
        $numeric = 0;
    }
    if ($numeric < 0) {
        return 0;
    }
    if ($numeric > BOARD_MAX_INDEX) {
        return BOARD_MAX_INDEX;
    }
    return $numeric;
}

function clampNonNegativeInt($value): int
{
    if (is_numeric($value)) {
        $numeric = (int)$value;
    } else {
        $numeric = 0;
    }
    return $numeric < 0 ? 0 : $numeric;
}

function clampDiceValueInt($value): int
{
    if (is_numeric($value)) {
        $numeric = (int)$value;
    } else {
        $numeric = 0;
    }
    if ($numeric <= 0) {
        return 0;
    }
    if ($numeric > 6) {
        return 6;
    }
    return $numeric;
}

function pickBoardColor(array $usedColors): string
{
    $palette = ['rose', 'mint', 'violet', 'sun', 'sea'];
    foreach ($palette as $color) {
        if (!in_array($color, $usedColors, true)) {
            return $color;
        }
    }
    return $palette[count($palette) - 1] ?? 'rose';
}

function appendBoardHistory(array &$state, string $message): void
{
    if (!isset($state['history']) || !is_array($state['history'])) {
        $state['history'] = [];
    }
    $state['history'][] = [
        'message' => $message,
        'timestamp' => gmdate('c'),
    ];
    if (count($state['history']) > 40) {
        $state['history'] = array_slice($state['history'], -40);
    }
}
