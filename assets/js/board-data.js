const adultFields = [
  { index: 0, type: 'start', label: 'Start' },
  { index: 1, type: 'task', label: 'Co chciałbyś wypróbować w łóżku po raz pierwszy?' },
  { index: 2, type: 'task', label: 'Opisz, co najbardziej cię kręciło w naszym pierwszym sexie.' },
  { index: 3, type: 'task', label: 'Dotknij dłoni partnera i szepnij mu do ucha coś sprośnego.' },
  { index: 4, type: 'safe', label: 'Bezpieczne pole' },
  { index: 5, type: 'task', label: 'Zrób partnerowi lekki masaż ramion przez minutę.' },
  { index: 6, type: 'task', label: 'Masuj partnera olejkiem, skupiając się na dolnych częściach ciała.' },
  { index: 7, type: 'task', label: 'Pocałuj partnera w ucho, szepcząc swoją sexualną fantazję.' },
  { index: 8, type: 'task', label: 'Wyślij partnerowi niegrzeczną wiadomość.' },
  { index: 9, type: 'moveForward', label: 'Idziesz 5 pól do przodu.' },
  { index: 10, type: 'task', label: 'Opisz co Cię we mnie najbardziej podnieca.' },
  { index: 11, type: 'task', label: 'Jaka jest Twoja ulubiona zabawka erotyczna do użycia razem?' },
  { index: 12, type: 'task', label: 'Pocałuj partnera w usta wolno, z językiem.' },
  { index: 13, type: 'task', label: 'Opowiedz o swoim najbardziej pamiętnym orgazmie ze mną.' },
  { index: 14, type: 'jail', label: 'Więzienie rób przez minutę co mówi partner lub tracisz dwie kolejki', penaltyTurns: 2 },
  { index: 15, type: 'task', label: 'Poliż partnera po szyi wolno, schodząc niżej.' },
  { index: 16, type: 'task', label: 'Chciałbyś/aś oglądać porno razem?' },
  { index: 17, type: 'task', label: 'Dotykaj partnera pod ubraniem przez 30 sekund.' },
  { index: 18, type: 'moveBack', label: 'Cofasz się o 4 pola.' },
  { index: 19, type: 'task', label: 'Szeptaj niegrzeczne słowa do ucha partnera przez minutę.' },
  { index: 20, type: 'task', label: 'Zrób erotyczne selfie i pokaż partnerowi.' },
  { index: 21, type: 'task', label: 'Co chiałbyś/aś Usłuszeć odemnie podczas sexu?' },
  { index: 22, type: 'task', label: 'Zademonstruj swój najlepszy ruch oralny na partnerze.' },
  { index: 23, type: 'task', label: 'Zrób partnerowi masaż ciała nago.' },
  { index: 24, type: 'task', label: 'Zwiąż ręce partnera i drażnij go językiem.' },
  { index: 25, type: 'task', label: 'Rozbierz się i dalej graj nago.' },
  { index: 26, type: 'task', label: 'Ubierasz wszystko co ściągnąłeś/aś' },
  { index: 27, type: 'task', label: 'Dotykaj się i patrz jak reaguje partner przez minutę.' },
  { index: 28, type: 'task', label: 'Zrób striptease, kończąc nago przed partnerem.' },
  { index: 29, type: 'task', label: 'Załóż opaskę na oczy i pozwól partnerowi Cię dotykać.' },
  { index: 30, type: 'safe', label: 'Bezpieczne pole' },
  { index: 31, type: 'task', label: 'Zdejmij bieliznę partnera zębami.' },
  { index: 32, type: 'task', label: 'Pokaż jak lubisz, gdy partner Cię dotyka.' },
  { index: 33, type: 'task', label: 'Użyj lodu do drażnienia sutków partnera przez minutę.' },
  { index: 34, type: 'task', label: 'Obejrzyjcie fragment porno i naśladujcie jedną scenę ubrani.' },
  { index: 35, type: 'task', label: 'Nagraj telefonem jak się dotykasz w sąsiednim pokoju i pokaż potem partnerowi.' },
  { index: 36, type: 'gotoNearestSafe', label: 'Cofasz się na najbliższe bezpieczne pole' },
  { index: 37, type: 'jail', label: 'Więzienie rób przez minutę co mówi partner lub tracisz dwie kolejki', penaltyTurns: 2 },
  { index: 38, type: 'task', label: 'Opowiedz mi o swojej ulubionej fantazji.' },
  { index: 39, type: 'finish', label: 'Meta! Przegrany musi zrobić jedną rzecz, którą powie wygrany.' },
];

const romanticFields = [
  { index: 0, type: 'start', label: 'Start' },
  { index: 1, type: 'task', label: 'Opowiedz partnerowi o jednym momencie, w którym poczułeś/poczułaś: „Ale mam szczęście, że Cię mam”.' },
  { index: 2, type: 'task', label: 'Powiedz partnerowi trzy rzeczy, które w nim/nich najbardziej kochasz' },
  { index: 3, type: 'task', label: 'Przypomnij sobie Waszą pierwszą randkę. Co najbardziej zapadło Ci wtedy w pamięć?' },
  { index: 4, type: 'safe', label: 'Bezpieczne pole – przytulcie się mocno' },
  { index: 5, type: 'task', label: 'Opisz idealny wspólny wieczór tylko we dwoje – krok po kroku.' },
  { index: 6, type: 'task', label: 'Powiedz partnerowi co Ci się w nim najbardziej podoba' },
  { index: 7, type: 'task', label: 'Zamknij oczy i opisz, po czym poznajesz, że partner jest obok – bez patrzenia.' },
  { index: 8, type: 'task', label: 'Wybierz jedno wspólne zdjęcie w telefonie i powiedz, dlaczego jest dla Ciebie ważne.' },
  { index: 9, type: 'moveForward', steps: 3, label: 'Idziesz 3 pola do przodu – czasem miłość robi duży krok naprzód. 💓' },
  { index: 10, type: 'task', label: 'Podziękuj partnerowi za jedną konkretną rzecz, którą zrobił dla Ciebie w ostatnim czasie.' },
  { index: 11, type: 'task', label: 'Przez 30 sekund patrzcie sobie w oczy w ciszy. Na końcu powiedzcie jedną myśl, która się pojawiła.' },
  { index: 12, type: 'task', label: 'Opowiedz partnerowi o jednym swoim marzeniu, którego jeszcze z nim/nią nie dzieliłeś/dzieliłaś.' },
  { index: 13, type: 'task', label: 'Zaproponuj jedno nowe wspólne hobby lub rytuał, który chcielibyście wprowadzić do życia.' },
  { index: 14, type: 'safe', label: 'Bezpieczne pole – złapcie się za ręce i powiedzcie jednocześnie: „Jesteś dla mnie ważny/ważna.”' },
  { index: 15, type: 'task', label: 'Opowiedz o sytuacji, w której partner bardzo Cię wsparł – nawet jeśli to było coś drobnego.' },
  { index: 16, type: 'jail', label: 'Więzienie – przez 30 sekund wykonujesz małe, miłe polecenia partnera (same dobre rzeczy!) lub tracisz dwie tury.', penaltyTurns: 2 },
  { index: 17, type: 'task', label: 'Zaproponuj partnerowi, jak moglibyście lepiej dbać o czas tylko dla siebie w tygodniu.' },
  { index: 18, type: 'moveBack', steps: 2, label: 'Cofasz się o 2 pola' },
  { index: 19, type: 'task', label: 'Powiedz partnerowi, jaki jego/jej drobny nawyk potrafi Cię niespodziewanie rozczulić.' },
  { index: 20, type: 'task', label: 'Narysuj palcem na plecach partnera coś, co kojarzy Ci się z Wami.' },
  { index: 21, type: 'task', label: 'Zróbcie szybki „ranking” – każdy z Was niech powie TOP 3 wspólne chwile, które najbardziej pamięta.' },
  { index: 22, type: 'moveForward', steps: 4, label: 'Idziesz 4 pola do przodu – czas na kolejny krok razem.' },
  { index: 23, type: 'task', label: 'Opisz w jednym zdaniu, za co jesteś dziś najbardziej wdzięczny/wdzięczna partnerowi.' },
  { index: 24, type: 'task', label: 'Wyobraź sobie Was za 10 lat. Jak wygląda Wasz zwykły, wspólny dzień?' },
  { index: 25, type: 'safe', label: 'Bezpieczne pole – zamknijcie oczy i pomyślcie o jednym swoim marzeniu. Możecie się nim podzielić lub zostawić je w sercu.' },
  { index: 26, type: 'task', label: 'Zaproponuj partnerowi mały rytuał na dziś po grze (np. herbata, spacer, wspólny film).' },
  { index: 27, type: 'task', label: 'Powiedz partnerowi, co sprawia, że czujesz się przy nim/niej bezpiecznie.' },
  { index: 28, type: 'jail', label: 'Więzienie – pauzujesz jedną kolejkę, chyba że partner „uwolni” Cię przytulasem.', penaltyTurns: 1 },
  { index: 29, type: 'task', label: 'Zróbcie wspólnie krótką listę: jedna, dwie, trzy rzeczy, które chcecie zrobić razem w tym miesiącu.' },
  { index: 30, type: 'gotoNearestSafe', label: 'Cofasz się na najbliższe Bezpieczne pole – czas złapać oddech i bliskość.' },
  { index: 31, type: 'task', label: 'Każdy z Was niech dokończy zdanie: „Kocham, kiedy Ty…”' },
  { index: 32, type: 'task', label: 'Przypomnij partnerowi o czymś, z czego jesteś z niego/niej dumny/dumna.' },
  { index: 33, type: 'safe', label: 'Bezpieczne pole – po prostu bądźcie przez chwilę blisko, bez gadania, tylko razem.' },
  { index: 34, type: 'task', label: 'Wymyślcie razem Wasze „hasło miłości” – jedno słowo lub krótkie zdanie tylko dla Was.' },
  { index: 35, type: 'task', label: 'Powiedz partnerowi, za co chcesz mu/jej dziś szczególnie podziękować.' },
  { index: 36, type: 'finish', label: 'Meta! Podziękujcie sobie za tę wspólną podróż. Wygrany wybiera jedno czułe lub miłe zadanie dla przegranego. 💖' },
];

export const BOARD_VARIANTS = {
  adult: {
    id: 'adult',
    name: 'Planszówka dla dwojga (dla dorosłych)',
    accessPage: 'planszowa.html',
    invitePage: 'planszowa-invite.html',
    waitingPage: 'planszowa-waiting.html',
    storagePrefix: 'momenty.planszowka.adult',
    fields: adultFields,
  },
  romantic: {
    id: 'romantic',
    name: 'Planszówka dla dwojga (romantyczna, zbliżająca)',
    accessPage: 'planszowa-romantyczna.html',
    invitePage: 'planszowa-romantyczna-invite.html',
    waitingPage: 'planszowa-romantyczna-waiting.html',
    storagePrefix: 'momenty.planszowka.romantic',
    fields: romanticFields,
  },
};

function detectBoardVariant() {
  if (typeof document === 'undefined') {
    return 'adult';
  }
  const variant = (document.body?.dataset?.boardVariant || '').trim().toLowerCase();
  if (variant && Object.prototype.hasOwnProperty.call(BOARD_VARIANTS, variant)) {
    return variant;
  }
  return 'adult';
}

export const boardVariantId = detectBoardVariant();
export const boardConfig = BOARD_VARIANTS[boardVariantId];

export function getBoardConfig(variantId = boardVariantId) {
  return BOARD_VARIANTS[variantId] || BOARD_VARIANTS.adult;
}

export const boardFields = boardConfig.fields;
export const finishIndex = boardFields.length - 1;
