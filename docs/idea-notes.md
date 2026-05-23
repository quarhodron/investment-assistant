Poniżej wersja przerobiona pod Twoje założenie: **chcesz odtworzyć aplikację**, a nie dokumentować szczegółową logikę promptów. Usunąłem odniesienia do prezentera, sekwencji promptów i modułowej tabeli produktowej.

---

# Opis aplikacji do odtworzenia

## 1. Czym jest aplikacja

Aplikacja jest wewnętrznym narzędziem AI do researchu inwestycyjnego, służącym do analizowania branż oraz spółek giełdowych na podstawie promptów zapisanych przez użytkownika.

Jej celem jest przyspieszenie pracy analitycznej: użytkownik zapisuje własne prompty, uruchamia je na wybranej branży lub spółce, a aplikacja zapisuje wyniki analiz, źródła oraz listę interesujących spółek.

Aplikacja nie podejmuje decyzji inwestycyjnych. Ma dostarczać uporządkowany research, który użytkownik może później samodzielnie zweryfikować i zinterpretować.

---

## 2. Główne zadanie aplikacji

Aplikacja ma umożliwiać użytkownikowi:

- zapisanie własnych promptów analitycznych,
- uruchamianie promptów dla wybranej branży lub spółki,
- zapisywanie wykonanych analiz,
- przeglądanie historii analiz,
- zapisywanie spółek do obserwowanych,
- uruchamianie analizy AI dla zapisanej spółki,
- przechowywanie wyników wraz ze źródłami.

Najważniejsze założenie: **logika analityczna znajduje się w promptach użytkownika, a aplikacja jest systemem do ich organizowania, uruchamiania i zapisywania wyników.**

---

## 3. Podział aplikacji na strony

## 3.1. Dashboard / strona główna

Strona startowa aplikacji powinna pokazywać najważniejsze elementy systemu: ostatnie analizy, zapisane spółki.

---

## 3.2. Strona promptów

To miejsce, w którym użytkownik zarządza własnymi promptami.

Na tej stronie użytkownik powinien móc:

- dodać nowy prompt,
- nadać mu nazwę,
- opisać jego przeznaczenie,
- wkleić treść promptu,
- edytować zapisany prompt,
- usunąć prompt,
- wybrać prompt do późniejszego uruchomienia.

Prompt powinien być traktowany jako główny element roboczy aplikacji. To użytkownik decyduje, co prompt robi i jak szczegółowa jest jego logika.

---

## 3.3. Strona analiz

To miejsce, w którym użytkownik widzi wszystkie zapisane analizy.

Każda analiza powinna zawierać:

- tytuł analizy,
- typ analizy, np. branża albo spółka,
- datę utworzenia,
- użyty prompt,
- dane wejściowe podane przez użytkownika,
- wynik wygenerowany przez AI,
- źródła, jeśli zostały zwrócone,
- możliwość ponownego otwarcia analizy w trybie tylko do odczytu.

Zapisana analiza jest niezmienna — użytkownik może ją czytać, ale nie edytować ani dopisywać do niej notatek. Jeśli chce rozwinąć temat, używa funkcji „Kontynuuj analizę", która tworzy nową, powiązaną analizę.

Strona analiz pełni funkcję historii pracy użytkownika.

---

## 3.4. Strona nowej analizy

To ekran, na którym użytkownik uruchamia analizę AI.

Użytkownik powinien móc:

- wybrać typ analizy (branża albo spółka) — wybór jest jawny i ręczny,
- wybrać zapisany prompt,
- wpisać temat analizy, np. branżę, spółkę, ticker albo dowolny kontekst,
- opcjonalnie podać dodatkowe informacje,
- wybrać model AI, którym ma zostać uruchomiona analiza — domyślnie podpowiadany jest model ustawiony w Ustawieniach, ale użytkownik może go nadpisać jednorazowo dla tej analizy,
- uruchomić analizę,
- zobaczyć wynik,
- zapisać wynik jako analizę.

Ten ekran powinien być możliwie prosty: wybór typu analizy, wybór promptu, wybór modelu, pole na dane wejściowe i przycisk uruchomienia.

---

## 3.5. Strona spółek obserwowanych

To miejsce, w którym użytkownik zapisuje spółki, do których chce wracać.

Dla każdej spółki aplikacja powinna przechowywać:

- nazwę spółki,
- ticker,
- giełdę lub rynek, jeśli użytkownik ją poda,
- branżę,
- notatkę użytkownika,
- powiązane analizy.

Z poziomu tej strony użytkownik powinien móc uruchomić analizę AI dla wybranej spółki, wybierając jeden ze swoich zapisanych promptów.

---

## 3.6. Widok szczegółów spółki

Widok pojedynczej spółki powinien pokazywać jej podstawowe dane, notatki użytkownika oraz historię analiz wykonanych dla tej spółki.

Z tego poziomu użytkownik powinien móc:

- edytować dane spółki,
- dodać notatkę,
- uruchomić nową analizę AI,
- przejrzeć wcześniejsze analizy tej spółki,
- **kontynuować wcześniejszą analizę tej spółki** — użytkownik wybiera jedną z poprzednich analiz spółki jako punkt wyjścia, aplikacja przekazuje jej wynik jako kontekst do nowego uruchomienia AI, a użytkownik może w tym momencie wybrać inny prompt niż ten, którym zrobiono pierwotną analizę (np. zacząć od ogólnego researchu, a kontynuować promptem do analizy finansowej). Może też zmienić model AI dla tej kontynuacji.

Kontynuacja analizy powinna być zapisywana jako nowa analiza powiązana ze spółką oraz z analizą-rodzicem, tak aby zachować łańcuch researchu.

---

## 3.7. Widok szczegółów analizy

Widok pojedynczej analizy powinien prezentować pełny wynik wygenerowany przez AI w trybie tylko do odczytu.

Powinien zawierać:

- nazwę analizy,
- datę utworzenia,
- użyty prompt,
- użyty model AI,
- dane wejściowe użytkownika,
- odpowiedź AI,
- źródła,
- możliwość zapisania spółek znalezionych w wyniku analizy do listy obserwowanych, jeśli użytkownik chce to zrobić ręcznie,
- **przycisk „Kontynuuj analizę”** — uruchamia nową analizę dla tej samej spółki, z wynikiem bieżącej analizy jako kontekstem. Użytkownik na tym etapie może wybrać inny prompt (np. przejść z researchu ogólnego na analizę finansową) oraz inny model AI. Powstała kontynuacja jest zapisywana jako nowa analiza powiązana z analizą bieżącą.

Sama treść analizy (nazwa, prompt, dane wejściowe, odpowiedź AI, źródła) jest niezmienna — nie ma trybu edycji ani pola na notatki. Jeżeli użytkownik chce rozwinąć wątek lub coś dopisać, robi to przez „Kontynuuj analizę".

---

## 3.8. Ustawienia

Strona ustawień powinna umożliwiać konfigurację techniczną aplikacji **per użytkownik** — każdy użytkownik ma własne klucze API i własny domyślny model.

Powinna zawierać:

- klucze API do dostawców modeli AI (osobny klucz na dostawcę), zapisywane per użytkownik,
- wybór **domyślnego modelu** używanego do analiz (jest tylko podpowiedzią — użytkownik może go nadpisać per analiza w sekcji 3.4 i przy kontynuacji w 3.6 / 3.7),
- listę modeli, które aplikacja wystawia użytkownikowi do wyboru, obejmującą dwie grupy dostawców:
  - **Anthropic** (rodzina Claude),
  - **OpenAI** (rodzina GPT).

Lista konkretnych wariantów modeli powinna być utrzymywana jako konfiguracja aplikacji, tak aby dało się ją łatwo aktualizować w miarę pojawiania się nowych wersji.

---

# 4. Logika biznesowa aplikacji

## 4.1. Użytkownik sam definiuje logikę analizy w promptach

Aplikacja nie narzuca sposobu analizowania spółek ani branż, tylko pozwala użytkownikowi zapisywać i uruchamiać własne prompty.

## 4.2. Aplikacja organizuje pracę analityczną

Główną wartością aplikacji jest uporządkowanie promptów, analiz, spółek i wyników w jednym miejscu.

## 4.3. Wynik AI jest materiałem roboczym

Odpowiedź modelu AI nie jest finalną decyzją, ale materiałem do dalszej weryfikacji przez użytkownika.

## 4.4. Dane powinny być zapisywane

Aplikacja musi zapisywać prompty, spółki i analizy, aby użytkownik nie tracił pracy po odświeżeniu strony.

## 4.5. Aplikacja ma wspierać powtarzalny proces researchu

Użytkownik powinien móc regularnie wracać do tych samych promptów, spółek i analiz, aby budować własny system pracy.

## 4.6. Aplikacja jest wieloużytkownikowa

Aplikacja obsługuje wielu użytkowników. Każdy użytkownik widzi i zarządza wyłącznie własnymi danymi: promptami, analizami, spółkami obserwowanymi oraz konfiguracją API i modeli. Dane jednego użytkownika nie są dostępne dla innych.

---

# 5. Wymagania funkcjonalne aplikacji

## 5.1. Zarządzanie promptami

Aplikacja musi pozwalać użytkownikowi dodawać, edytować, usuwać i przeglądać własne prompty analityczne.

## 5.2. Uruchamianie analizy AI

Użytkownik musi móc wybrać zapisany prompt, podać dane wejściowe i uruchomić analizę AI. Przy uruchomieniu użytkownik widzi domyślny model z Ustawień i może go nadpisać dla bieżącej analizy.

## 5.3. Zapisywanie analiz

Aplikacja musi zapisywać wyniki analiz wraz z datą, użytym promptem i danymi wejściowymi.

## 5.4. Przeglądanie historii analiz

Użytkownik musi mieć dostęp do listy wcześniejszych analiz i możliwość otwarcia każdej z nich.

## 5.5. Zarządzanie spółkami obserwowanymi

Aplikacja musi pozwalać użytkownikowi dodawać, edytować, usuwać i przeglądać spółki obserwowane.

## 5.6. Analiza konkretnej spółki

Użytkownik powinien móc uruchomić dowolny zapisany prompt dla wybranej spółki, wskazując model AI (z opcją nadpisania domyślnego).

## 5.6a. Kontynuacja analizy spółki

Aplikacja musi umożliwiać kontynuowanie wcześniej wykonanej analizy spółki. Kontynuacja oznacza, że:

- użytkownik wskazuje istniejącą analizę jako punkt wyjścia,
- jej wynik jest przekazywany jako kontekst do kolejnego uruchomienia AI,
- użytkownik może wybrać **inny prompt** niż ten użyty w analizie wyjściowej,
- użytkownik może wybrać **inny model AI** niż ten użyty w analizie wyjściowej,
- nowa analiza jest zapisywana z odniesieniem do analizy-rodzica, tak aby zachować łańcuch researchu.

## 5.7. Analiza branży

Użytkownik powinien móc uruchomić dowolny zapisany prompt dla wpisanej branży lub tematu rynkowego.

## 5.8. Powiązanie analiz ze spółkami

Aplikacja powinna pozwalać przypisać wykonaną analizę do konkretnej spółki, jeśli analiza jej dotyczy.

## 5.9. Obsługa źródeł

Aplikacja powinna przechowywać źródła zwrócone przez model AI, o ile są częścią odpowiedzi.

## 5.10. Dodawanie spółek z wyniku analizy

Użytkownik powinien móc ręcznie dodać spółkę do obserwowanych na podstawie wyniku analizy.

## 5.11. Konfiguracja API

Aplikacja musi pozwalać skonfigurować połączenie z modelami AI od dwóch dostawców: **Anthropic** i **OpenAI**. Konfiguracja jest **per użytkownik** — każdy użytkownik podaje własne klucze API (osobny klucz na dostawcę), wybiera dostępne warianty modeli i ustawia własny domyślny model używany do nowych analiz. Wybór domyślnego modelu jest jedynie podpowiedzią — użytkownik może go nadpisać przy każdym uruchomieniu lub kontynuacji analizy.

## 5.12. Trwałość danych

Dane użytkownika powinny być zapisywane w bazie danych lub lokalnym storage, tak aby nie znikały po odświeżeniu strony.

---

# 6. Wymagania niefunkcjonalne i ograniczenia

## 6.1. Prostota użycia

Aplikacja powinna być prosta: użytkownik zapisuje prompt, wybiera go, podaje temat i otrzymuje wynik.

## 6.2. Elastyczność

System nie powinien narzucać konkretnej metodologii analizy, ponieważ użytkownik sam definiuje ją w promptach.

## 6.3. Możliwość rozbudowy

Aplikacja powinna być zaprojektowana tak, aby później można było dodać integracje z danymi finansowymi, dodatkowymi API lub zewnętrznymi źródłami.

## 6.4. Ograniczenie odpowiedzialności AI

Aplikacja nie powinna sugerować, że wynik AI jest rekomendacją inwestycyjną.

## 6.5. Czytelność wyników

Wyniki analiz powinny być prezentowane w czytelnej formie, najlepiej jako tekst z nagłówkami, listami i źródłami.

## 6.6. Bezpieczeństwo danych

Klucze API i dane użytkownika powinny być przechowywane w bezpieczny sposób. Klucze API są zapisywane per użytkownik (np. zaszyfrowane w bazie) i nigdy nie są współdzielone między kontami.

## 6.7. Izolacja danych między użytkownikami

Aplikacja musi gwarantować, że żaden użytkownik nie ma dostępu do danych innego użytkownika — ani przez interfejs, ani przez API. Dotyczy to promptów, analiz, spółek obserwowanych, kluczy API oraz ustawień modeli.

---

# 7. Najkrótszy opis aplikacji

Aplikacja jest narzędziem do organizowania własnego researchu inwestycyjnego z pomocą AI. Użytkownik zapisuje własne prompty, uruchamia je dla branż lub spółek, zapisuje wyniki analiz, prowadzi listę obserwowanych spółek i wraca do wcześniejszych wyników. Logika analityczna znajduje się w promptach, a sama aplikacja odpowiada za interfejs, zapis danych, uruchamianie AI i porządkowanie wyników.
