<?php

declare(strict_types=1);

define('BOOTSTRAP_EMIT_JSON', false);

require __DIR__ . '/api/bootstrap.php';
require __DIR__ . '/api/mail_helpers.php';

const DEFAULT_PLAN_BASE = 'https://sklep.allemedia.pl/momenty/';

$token = trim((string)($_GET['token'] ?? ''));
$decisionParam = strtolower(trim((string)($_GET['decision'] ?? 'accept')));
$decision = $decisionParam === 'decline' ? 'decline' : 'accept';
$status = 'invalid';
$headline = 'Ups!';
$message = 'Link jest niepoprawny lub wygasł.';
$ctaHref = DEFAULT_PLAN_BASE . 'plan-wieczoru-play.html';
$ctaLabel = 'Zaproponuj własny plan wieczoru';
$showProposalForm = false;
$proposalIntro = '';

if ($token !== '') {
    $invite = getPlanInviteByToken($token);
    if ($invite) {
        $planLink = trim((string)($invite['plan_link'] ?? ''));
        if ($planLink === '') {
            $planLink = DEFAULT_PLAN_BASE . 'plan-wieczoru-play.html';
        }
        $alreadyAccepted = isset($invite['accepted_at']) && $invite['accepted_at'] !== '';
        $alreadyDeclined = isset($invite['declined_at']) && $invite['declined_at'] !== '';

        if ($decision === 'decline') {
            if (!$alreadyDeclined && !$alreadyAccepted) {
                markPlanInviteDeclined((int)$invite['id']);

                $senderEmail = trim((string)($invite['sender_email'] ?? ''));
                $partnerEmail = trim((string)($invite['partner_email'] ?? ''));
                $senderName = trim((string)($invite['sender_name'] ?? ''));
                $proposalLink = trim((string)($invite['proposal_link'] ?? ''));
                if ($proposalLink === '') {
                    $proposalLink = DEFAULT_PLAN_BASE . 'plan-wieczoru-play.html';
                }

                $summaryLines = buildSummaryLines($invite);

                $declineSubject = 'Plan Wieczoru: partner proponuje zmiany 💛';
                $declineLines = [
                    'Cześć' . ($senderName !== '' ? ' ' . $senderName : '') . '!',
                    ($partnerEmail !== '' ? 'Partner (' . $partnerEmail . ') woli zaplanować ten wieczór inaczej.' : 'Partner woli zaplanować ten wieczór inaczej.'),
                    '',
                    'Wybrany wcześniej plan wyglądał tak:',
                ];
                $declineLines = array_merge($declineLines, $summaryLines);

                $energyContext = trim((string)($invite['energy_context'] ?? ''));
                if ($energyContext !== '') {
                    $declineLines[] = '';
                    $declineLines[] = $energyContext;
                }

                $declineLines[] = '';
                $declineLines[] = 'Możesz zaproponować nowy plan tutaj:';
                $declineLines[] = $proposalLink;
                $declineLines[] = '';
                $declineLines[] = 'Czekamy na kolejny pomysł!';

                $declineBody = implode("\n", $declineLines);
                if ($senderEmail !== '' && filter_var($senderEmail, FILTER_VALIDATE_EMAIL)) {
                    sendEmailMessage($senderEmail, $declineSubject, $declineBody, $partnerEmail !== '' ? $partnerEmail : null);
                }

                $status = 'declined';
                $headline = 'Dzięki za odpowiedź!';
                $message = 'Przekazaliśmy informację, że wolisz zaplanować ten wieczór inaczej. Partner dostanie e-mail z Twoją decyzją.';
                $ctaHref = $planLink;
                $showProposalForm = true;
                $proposalIntro = 'Masz inny pomysł na spędzenie wieczoru? Podaj swoje imię i przygotuj własną propozycję.';
            } elseif ($alreadyDeclined) {
                $status = 'already';
                $headline = 'Odpowiedź już wysłana';
                $message = 'Wygląda na to, że wcześniej poprosiłeś o inny plan. Możesz zawsze zaproponować własną wersję.';
                $ctaHref = $planLink;
            } else {
                $status = 'already';
                $headline = 'Plan już potwierdzony';
                $message = 'Ten plan został już zaakceptowany. Jeśli chcesz zaproponować inny, rozpocznij nową zabawę.';
                $ctaHref = $planLink;
            }
        } else {
            if (!$alreadyAccepted && !$alreadyDeclined) {
                markPlanInviteAccepted((int)$invite['id']);

                $senderName = trim((string)($invite['sender_name'] ?? ''));
                $partnerEmail = trim((string)($invite['partner_email'] ?? ''));
                $senderEmail = trim((string)($invite['sender_email'] ?? ''));

                $summaryLines = buildSummaryLines($invite);

                $acceptSubject = 'Plan Wieczoru został zaakceptowany 💛';
                $acceptLines = [
                    'Cześć' . ($senderName !== '' ? ' ' . $senderName : '') . '!',
                    ($partnerEmail !== '' ? 'Partner (' . $partnerEmail . ') potwierdził Wasz plan wieczoru.' : 'Partner potwierdził Wasz plan wieczoru.'),
                    '',
                    'Podsumowanie planu:',
                ];
                $acceptLines = array_merge($acceptLines, $summaryLines);

                $energyContext = trim((string)($invite['energy_context'] ?? ''));
                if ($energyContext !== '') {
                    $acceptLines[] = '';
                    $acceptLines[] = $energyContext;
                }

                $acceptLines[] = '';
                $acceptLines[] = 'Możesz wrócić do zabawy Plan Wieczoru:';
                $acceptLines[] = $planLink;
                $acceptLines[] = '';
                $acceptLines[] = 'Miłego wieczoru! 💛';

                $acceptBody = implode("\n", $acceptLines);
                if ($senderEmail !== '' && filter_var($senderEmail, FILTER_VALIDATE_EMAIL)) {
                    sendEmailMessage($senderEmail, $acceptSubject, $acceptBody, $partnerEmail !== '' ? $partnerEmail : null);
                }

                $status = 'accepted';
                $headline = 'Zgoda zapisana!';
                $message = 'Dziękujemy za potwierdzenie. Twój partner otrzymał wiadomość z informacją, że się zgadzasz.';
                $ctaHref = $planLink;
            } elseif ($alreadyAccepted) {
                $status = 'already';
                $headline = 'Plan już potwierdzony';
                $message = 'Wygląda na to, że ten plan został już zaakceptowany wcześniej.';
                $ctaHref = $planLink;
            } else {
                $status = 'already';
                $headline = 'Plan oczekuje na zmianę';
                $message = 'Ten plan został wcześniej odrzucony i czeka na nową propozycję.';
                $ctaHref = $planLink;
            }
        }
    }
}

function formatValue(mixed $value): string
{
    $text = trim((string)($value ?? ''));
    return $text !== '' ? $text : '—';
}

function buildSummaryLines(array $invite): array
{
    $extras = [];
    if (isset($invite['extras_json'])) {
        $decoded = json_decode((string)$invite['extras_json'], true);
        if (is_array($decoded)) {
            $extras = array_values(array_filter(array_map('trim', $decoded), static fn ($item) => $item !== ''));
        }
    }

    return [
        'Na jaki wieczór masz dziś ochotę?: ' . formatValue($invite['mood'] ?? ''),
        'Jakiej bliskości dziś potrzebujesz?: ' . formatValue($invite['closeness'] ?? ''),
        'Co stworzy idealny klimat?: ' . ($extras !== [] ? implode(', ', $extras) : 'Brak dodatków'),
        'Jak tam dziś Twoja forma?: ' . formatValue($invite['energy'] ?? ''),
        'Kiedy chcesz żebyśmy zaczęli?: ' . formatValue($invite['start_time'] ?? ''),
    ];
}
?>
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Plan Wieczoru – Potwierdzenie</title>
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="stylesheet" href="assets/css/style.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;700&display=swap" rel="stylesheet">
  <script type="module" src="assets/js/app.js"></script>
</head>
<body class="page page--game" data-theme="light">
  <main class="container">
    <header class="hero">
      <div class="hero__branding">
        <a class="hero__logo-link" href="index.html">
          <img
            class="hero__logo"
            src="https://sklep.allemedia.pl/momenty/logo.png"
            alt="Momenty"
          />
        </a>
        <div class="hero__text">
          <h1><?= htmlspecialchars($headline, ENT_QUOTES, 'UTF-8') ?></h1>
          <p><?= htmlspecialchars($message, ENT_QUOTES, 'UTF-8') ?></p>
        </div>
        <details class="game-switcher">
          <summary class="game-switcher__toggle">Wybierz grę</summary>
          <div class="game-switcher__panel">
            <ul class="game-switcher__list">
              <li><a class="game-switcher__link" href="pytania-dla-par.html">Pytania dla par</a></li>
              <li><a class="game-switcher__link" href="plan-wieczoru.html" aria-current="page">Plan Wieczoru – We Dwoje</a></li>
              <li><a class="game-switcher__link" href="planszowa.html">Planszówka dla dwojga (dla dorosłych)</a></li>
              <li><a class="game-switcher__link" href="planszowa-romantyczna.html">Planszówka dla dwojga (romantyczna, zbliżająca)</a></li>
              <li><a class="game-switcher__link" href="trio-challenge.html">Kółko i krzyżyk Wyzwanie</a></li>
              <li><a class="game-switcher__link" href="zdrapka-pozycji.html">Zdrapka pozycji</a></li>
            </ul>
          </div>
        </details>
      </div>
      <button class="btn btn--ghost" id="theme-toggle" type="button" aria-label="Przełącz motyw">🌙</button>
    </header>

    <section class="card card--game">
      <header class="card__header">
        <h2>Co dalej?</h2>
      </header>
      <?php if ($showProposalForm): ?>
        <p><?= htmlspecialchars($proposalIntro !== '' ? $proposalIntro : 'Przygotuj swoją wersję planu wieczoru.', ENT_QUOTES, 'UTF-8') ?></p>
        <form
          id="decline-proposal-form"
          class="form form--stack"
          data-success="plan-wieczoru-play.html"
          data-storage-key="momenty.planWieczoru.access"
        >
          <label class="form__field">
            <span>Twoje imię</span>
            <input type="text" name="display_name" placeholder="np. Ola" maxlength="40" required autocomplete="off" />
          </label>
          <p class="form__hint" data-role="error" hidden></p>
          <div class="form__actions">
            <button type="submit" class="btn btn--primary">Zaproponuj własny plan</button>
          </div>
        </form>
      <?php else: ?>
        <p>
          <a class="btn btn--primary" href="<?= htmlspecialchars($ctaHref, ENT_QUOTES, 'UTF-8') ?>"><?= htmlspecialchars($ctaLabel, ENT_QUOTES, 'UTF-8') ?></a>
        </p>
      <?php endif; ?>
      <p>
        <a class="btn btn--ghost" href="plan-wieczoru.html">Wróć do zabawy Plan Wieczoru</a>
      </p>
    </section>
  </main>
</body>
</html>
