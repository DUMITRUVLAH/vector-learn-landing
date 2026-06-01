# HOLLIHOP Schoolmaster (demo.t8s.ru) — Ecrane & Funcționalități Complete

> Analiză competitivă bazată pe documentația oficială Hollipedia + surse externe.
> Credențiale demo: `z@holyhope.ru` / `password` pe `demo.t8s.ru`
> Versiune produs: 29.05.2026 | Preț: de la 2.000 ₽/lună (utilizatori nelimitați)

---

## NAVIGARE PRINCIPALĂ (Sidebar stânga)

1. Расписание (Schedule)
2. Ученики (Students)
3. Лиды (Leads)
4. Задачи (Tasks)
5. Чаты (Chats)
6. Рассылки (Mailings)
7. Отчёты (Reports)
8. Финансы (Finance)
9. Компания (Company)
10. Заявки (Study Requests)
11. Экзамены (Exams)
12. Поездки (Trips)
13. Открытые уроки (Open Lessons)
14. Онлайн-обучение (Online Learning)
15. Библиотека (Library)
16. Рейтинги (Ratings)
17. Корпоративный отдел (Corporate Department)
18. Настройки (Settings) — jos în meniu

Vizibilitatea itemilor de meniu este configurabilă per rol.

---

## ECRAN: LOGIN (`/`)

**Câmpuri:** Логин, Пароль, checkbox Запомнить
**Butoane:** Войти, Забыли пароль?
**Footer:** Оферта (PDF), Конфиденциальность, selector limbă Русский/English, versiune 29.05.2026
**Support modal:** Email support@holyhope.ru, Skype hollihop-support

---

## ECRAN: РАСПИСАНИЕ (`/Schedule`)

**Layout:** Grilă orizontală pe săli (аудитории), scală temporală verticală stânga

**View-uri:** День / Неделя / Месяць + navigare săgeți stânga/dreapta

**Filtre:**
- Филиал (Branch)
- Корпоративный отдел
- Преподаватель (Teacher)
- Аудитория (Classroom)
- checkbox Разбивать по аудиториям

**Acțiuni per lecție:**
- Drag-and-drop → reprogramare (dialog confirmare cu dată/oră pre-populată)
- Resize (trage marginea de jos) → extindere durată
- Click → deschide pagina grupului / lecției individuale / examenului
- Codare culori per tip lecție

---

## ECRAN: УЧЕНИКИ (`/Students`)

**Coloane implicite:**
Имя, Статус (dropdown color-coded), Язык/Дисциплина, Уровень, Филиал, Ответственный, Телефон, Дата обращения, Источник рекламы

**Coloane opționale (show/hide):**
Data naștere, Categorie vârstă, Tip studiu, Nr. grupe, Datorie, Ultima activitate, Câmpuri custom

**Filtre principale:**
ФИО (search), Филиал, Статус, Язык, Уровень, Ответственный, Источник рекламы, Цель обучения, Тип обращения

**Filtre avansate (ascunse):**
Период обращения, Возрастная категория, Тип обучения, Câmpuri custom, checkbox Только должники, checkbox Дубликаты

**Butoane:** Добавить ученика, Export Excel, Показать/скрыть колонки, Рассылка (bulk)

**Acțiuni bulk (pe selecție):** Mailing SMS/email, schimbare responsabil, schimbare status

---

## ECRAN: КАРТОЧКА УЧЕНИКА (Student Card)

**Header:** Foto, Nume + ID, Status dropdown, buton Edit (pencil galben)

**Bloc Информация личная:**
ФИО, Пол (Gender), Дата рождения/Возраст, Язык уведомлений (RU/EN), Комментарий

**Bloc Контакты:**
- Telefon principal, Email principal
- Buton Добавить контактное лицо (pentru părinți/tutori)
- Per contact: iconițe mesaj/SMS/email, toggle Является плательщиком, iconița plic

**Bloc Информация по ученику:**
Язык/Дисциплина, Уровень, Дата обращения, Предполагаемая дата визита, Дата визита, Ответственный, Источник рекламы, Цель обучения, Date pașaport, toggle В черном списке

**Bloc Пользовательские поля:** câmpuri custom configurabile

**Bloc Общая информация (Quick Actions):**
Добавить в группу, Заниматься индивидуально, Записать на вступительный тест, Записать на бесплатное занятие, Добавить лид

**Bloc Расписание (per curs activ):**
- Tab-uri: active / завершённые / резерв
- Sold/datorie student
- Grilă calendar cu zilele lecției (navigabil cu săgeți)
- Date curs: start, end, preț implicit, plătit, rest
- Pencil edit параметры обучения
- Secțiune договор: număr, dată, generare documente

**Bloc Желаемое расписание:** adăugare slot preferat (zi + oră + comentariu)

**Bloc Тесты:**
- Добавить результат (categorie test, tip, dată, disciplină, skills, scor — roșu sub prag)
- Добавить отчёт об успеваемости (5 stele per criteriu, comentariu, selector grup)
- Link Все результаты

**Bloc Библиотека:** tab-uri В наличии / История, titlu manual, dată emitere, buton returnare

**Bloc Личный счёт:**
- Tab-uri Приход / Расход
- Per tranzacție: dată, sumă, metodă plată, pencil edit, coș ștergere, generare chitanță
- Link Поступления и списания

**Bloc История и задачи:** ultimele 5 acțiuni, link Полностью, buton Добавить историю, buton Назначить задачу

**Bloc Визиты в портал:** dată/oră login, durată (minute), link Полностью

---

## ECRAN: ЛИДЫ (`/Leads`)

**Coloane implicite:** Имя, Статус (color-coded dropdown), Язык, Уровень, Филиал, Ответственный, Телефон, Дата обращения, Источник рекламы

**Filtre:** Филиал, Ответственный, Статус, Язык/Дисциплина, Уровень, Источник рекламы, Тип обращения, Период, Возрастная категория, Câmpuri custom

**Butoane:** Добавить лид, Export Excel, Показать/скрыть колонки, Рассылка, Список пробных уроков (colț dreapta sus)

**Acțiuni bulk:** Mailing SMS/email, schimbare responsabil/status, atașare lead la student direct din listă

---

## ECRAN: FORMULAR ADĂUGARE LID

| Câmp | Tip |
|------|-----|
| ФИО (Full Name) | text |
| Телефон | tel |
| Email | email |
| Skype | text |
| Дата рождения / Возраст | date/number (auto-calc reciproc) |
| Контактное лицо | text (multiplu) |
| Филиал / Корп. отдел | dropdown |
| Ответственный | dropdown |
| Статус лида | dropdown (color-coded) |
| Дата обращения | date |
| Источник рекламы | dropdown (configurabil în Settings) |
| Тип обращения | dropdown (configurabil) |
| Цель обучения | dropdown (configurabil) |
| Дисциплина | dropdown |
| Тип обучения | dropdown |
| Уровень | dropdown |
| Возрастная категория | dropdown |
| Комментарий | textarea |

Câmpuri obligatorii: configurabile în Settings → Ученики → Обязательные поля

---

## ECRAN: КАРТОЧКА ЛИДА (Lead Card)

Structură identică cu карточка ученика, plus:

**Bloc Информация по лиду:**
- Link la заявка sursă
- Buton Заявки лида
- Buton Подобрать группу (modal cu grupe filtrate pe filial, vârstă, disciplină, tip, nivel)

**Status lead:** dropdown color-coded cu 4 tipuri:
- В процессе (In Progress)
- Отложенный (Deferred)
- Финишный успешный (Successfully Converted)
- Финишный неуспешный (Lost)

---

## ECRAN: ЗАДАЧИ (`/Tasks`)

**View-uri:** Мои задачи / Все задачи / Календарь задач (День/Неделя/Месяц)

**Formular task:**
| Câmp | Note |
|------|------|
| Дата | Deadline |
| Приоритет | Afectează sortarea |
| Ответственный | Unul sau mai mulți angajați |
| Направление | Входящее / Исходящее |
| Способ | Звонок, Письмо, Визит (configurabil) |
| Цель | Opțional |
| Шаблон задачи | Text pre-creat |
| Описание | Obligatoriu |
| Выполнить в определённое время | Toggle cu oră exactă |
| Результат | Apare la închiderea task-ului |
| Для всех | Checkbox — vizibil pentru toată echipa |

**Butoane:** Добавить задачу, Назначить задачу, Добавить историю/задачу, Добавить коммуникацию

**Filtre:** Филиал, Ответственный, Приоритет, Статус, Период

---

## ECRAN: ЧАТЫ (`/Chats`)

**Tipuri de chat:**
- Chat intern angajați
- Chat grup cu profesor (per clasă)
- Chat colegi de grupă (studenți între ei)
- Chat portal studenți (student ↔ manager)
- Chat prin messengerele integrate (WhatsApp, Telegram, Max)

**Funcționalitate admin:** Автораспределение запросов (distribuție automată cereri pe manageri)

---

## ECRAN: РАССЫЛКИ (`/Mailings`)

**Canale disponibile:**
| Canal | Cost |
|-------|------|
| Email | Gratuit (SMTP propriu) |
| Push notificări | Gratuit (app mobil activ) |
| Telegram bot | Gratuit |
| Telegram cont personal | Plătit (Wappi) |
| WhatsApp | Plătit (Green API) |
| SMS | Plătit (SMS Center) |

**Tipuri destinatari:** Лиды, Ученики, Должники (debtors), Преподаватели, Контакты корп. отдела, Membri grupă

**Formular trimitere:**
- Toggle Сообщение / Email
- Buton Выбрать canal + ordine canale (cascade cu săgeți)
- Filtre contacte: все / основные / контактные лица / плательщики
- Dropdown Шаблон
- Link Условные обозначения (variabile)
- Câmp compunere mesaj
- Info SMS (caractere, pagini, total)
- Buton Отправить

**Tipuri redirecționare:**
- Manuale (masă, imediate)
- Automate (pe evenimente sau pe date)
- Каскадные (Cascading — fallback prin canale: WA → TG → SMS → Push)

**Segmentare destinatari:** По группам, По датам, Multi-select pe statusuri/surse

**Шаблоны рассылок:**
- Tipuri: Общие / В группах / Системные
- Email: câmpuri От, Тема, Corp (HTML/visual editor)
- SMS/WA/TG/Push: Название, Область применения, Text
- Variabile: `{ReceiverDebtSum}`, `{ReceiverDebtDate}`, plus variabile generale

**Rapoarte redirecționare:** Statistici trimitere, deschideri/clickuri email

---

## ECRAN: ОТЧЁТЫ (`/Reports`)

**Sub-secțiuni:**
1. Загрузка аудиторий (Classroom Utilization)
2. Загрузка преподавателей (Teacher Workload)
3. Воронка продаж (Sales Funnel — 3 moduri)
4. Изменения статусов лидов (Status Change Funnel)
5. Источники рекламы (Advertising Sources)
6. Статистика менеджеров (Manager Statistics)
7. Активные ученики (Active Students)
8. Состав клиентской базы (Client Portfolio Composition)
9. Статистика занятий (Class Statistics)
10. Статистика преподавателей (Teacher Statistics)
11. Отчёты по рассылкам (Mailing Reports)

**Metrici:** LTV, ARPU, Churn rate, Conversie lecție trial, UTM tracking

---

## ECRAN: ВОРОНКА ПРОДАЖ (`/Reports/SalesFunnel`)

**Filtre:**
- Филиал/Корп. отдел
- Период (data înregistrare)
- Ответственный менеджер
- Источник рекламы
- Тип обращения
- checkbox Учитывать следующие периоды для визита и платежей

**3 etape funnel:**
1. Новое обращение (total înregistrați în perioadă)
2. Визит в школу (subset care au vizitat)
3. Первый платёж (subset care au plătit primul)

**Metrici per etapă:** Count, % conversie, Sumă totală primei plăți, split studenți/corporativi, % distribuție

**Interactivitate:** Hover tooltip count, click etapă → lista studenților, toggle cantitativ vs. conversie

---

## ECRAN: ВОРОНКА «ИЗМЕНЕНИЯ СТАТУСОВ»

**Filtre:** Филиал, Период, Ответственный, Тип обращения, Источник рекламы, Дисциплина

**Vizualizare:** Piramidă inversată — nivel superior = total lizi; niveluri secvențiale = statusuri "В процессе" în ordinea configurată; nivel inferior = Финишный успешный

**Tabel metrici:** Count per status, % distribuție, click pe status → lista lidelor

---

## ECRAN: ФИНАНСЫ (`/Finance`)

**Sub-secțiuni:**

**Поступления и счета** — toate plățile studenților
Câmpuri: Data, Student, Sumă, Metodă plată, Notă, Editare

**Должники** — lista datornicilor cu acțiune directă

**Балансы личных счетов** — solduri rămase + lecții plătite dar neîncheiate

**Secțiunea Специальное:**
- Остатки за период (Balances for period)
- Остатки от полученных оплат (Balances from received payments)
- Оплаченное время (Paid time)
- История операций (Transaction history)
- Зарплата преподавателей (Teacher salaries)
- Расходы школы (School expenses)
- Рентабельность (Profitability: overall, by discipline, by group)
- Планы продаж (Sales plans)

---

## ECRAN: КОМПАНИЯ (`/Company`)

**Sub-secțiuni:** Сотрудники / Преподаватели / Филиалы / Аудитории / Объявления компании / Свободный поиск преподавателя

**Formular adăugare angajat:**
Email (login), ФИО, Роль (dropdown), Метод авторизации (Email/Phone/Login custom), Филиал (multi-select cu transfer interface), Корп. отдел

**Карточка сотрудника:**
- Foto upload (jpg/png, max 5MB)
- Blocuri: Задачи, Счёт/Оплата, Рейтинг, История действий (5 recente), Визиты в портал
- Acțiuni: управление доступом, reset parolă, upload/download fișiere, SMTP config, raport prezență

**Câmpuri suplimentare Преподаватели:**
- Дисциплины/Языки, Уровни, Возрастные категории
- Ставка по умолчанию, Сумма зарплаты
- Bloc financiar: Занятия, buton Оплатить занятия, Оплатить всю задолженность
- Selector tip plată (аванс/остаток/полностью), buton Доплата/Вычет, Список оплат
- Библиотека: Выдать книгу, tab-uri В наличии / История
- Calendar dublu (program propriu icon verde + program extern icon albastru)

**Filtre căutare profesor:** ФИО, Школа, Язык, Опыт, Возрастная категория, Пол, Носитель языка

---

## ECRAN: НАСТРОЙКИ (`/Settings`)

### Settings/Company (Настройки — Компания)
Tab-uri: Дисциплины, Уровни, Типы обучения, Возрастные категории, Академические часы (câmp Обозначение 1-3 chars), Локация, Прочее
Plus: Филиалы, Аудитории, Часовой пояс, параметри academici, sărbători, cheltuieli

### Settings/Employees (Настройки — Сотрудники)
- Статусы, Роли, Права ролей (permisiuni granulare per rol)
- Меню (itemi vizibili per rol), Таблицы (coloane vizibile per rol)
- Pagină de start configurabilă per rol

### Settings/Students (Настройки — Ученики)
- Статусы лидов (4 tipuri: В процессе / Финишный успешный / Финишный неуспешный / Отложенный)
- Статусы клиентов
- Автопродвижение лидов, Авто-действия
- Обязательные поля, Способы обращения, Цели обучения
- Пользовательские поля (custom fields)
- Личный кабинет (portal config), Закладки, Меню portal

### Settings/Finance (Настройки — Финансы)
- Способы оплаты (metode plată)
- Настройки зарплат преподавателей
- Статьи расходов (expense categories)
- Настройки счетов

### Settings/Notifications (Настройки — Оповещения)
Notificări automate pentru angajați/profesori/studenți pe trigger-uri de evenimente

### Settings/Templates (Настройки — Шаблоны)
- Template-uri: Договоры, Счета/Квитанции, Email, SMS, WhatsApp, Telegram
- Editor HTML + variabile dinamice + suport bilingv (RU/EN)

### Settings/Integrations (Настройки — Интеграции)
Email corporativ, SMS Center, WhatsApp (Green API), Telegram Bot, Telegram Personal (Wappi), UniSender, Max messenger, AmoCRM, Bitrix24, Tilda, 1C, CoMagic, VKontakte, Mango Office, Moi Zvonki, Yookassa, T-Bank/Tinkoff, PayMaster SBP, POS terminal, imprimantă chitanțe, PodpiSlon (semnătură electronică)

---

## ECRAN: ЗАЯВКИ (`/StudyRequests`)

Cereri intrare din surse externe (website, VK, formulare web). Operatori call center preiau și convertesc în lizi.

**Funcționalități:** Calendar call center, adăugare manuală, link-uri înregistrare la grupe, formulare web externe

**Câmpuri cerere:** fullName, eMail, phone, birthday, agentFullName, agentEMail, agentPhone, discipline, level, maturity, location, office, teacher, beginDate, endDate, weekdays, beginTime, endTime, edUnitId, type, description, utm_source, utm_medium, utm_campaign, utm_term, utm_content, extraData, roistat

---

## ECRAN: ОТКРЫТЫЕ УРОКИ (`/OpenLessons`)

**Coloane:** Название, Филиал, Язык/Дисциплина, Категorie, Уровень, Ак. часов, Тип, Расписание, Преподаватели, Аудитория, Лидов, Учеников, Câmpuri custom, Описание

**Filtre principale:** Филиал/Корп. отдел, Язык, Тип, Уровень, Преподаватель, Период занятий

**Filtre avansate:** Дни занятий, Время занятий, Месяц начала/окончания, Категории учеников, Учебные материалы

---

## ECRAN: ЭКЗАМЕНЫ (`/Exams`)

Creare examene, înregistrare studenți, pagini examene, liste examene.
Coloane similare cu OpenLessons: Название, Филиал, Дисциплина, Дата, Преподаватель, Studenți înregistrați

---

## ECRAN: ПОЕЗДКИ (`/Tours`)

Planificare excursii/tabere, înregistrare studenți, pagini excursii, statusuri
Layout: similar list view cu OpenLessons

---

## ECRAN: ОНЛАЙН-ОБУЧЕНИЕ (`/OnlineLearning`)

- Курсы (Courses) — cu capitole plătite și gratuite
- Онлайн-тесты (Online tests)
- LearningApps — exerciții interactive cu gamificare
- Домашние задания (Homework)
- Итоговое și промежуточное тестирование
- Тестирование на определение уровня
- Программы обучения, Учебные материалы
- Ссылки pe Zoom/Pruffme/YouTube per lecție

---

## ECRAN: БИБЛИОТЕКА (`/Library`)

- Adăugare manuale, distribuire, vânzare
- Inventar, completare stoc, transferuri între filiale, istoric
- Coloane: Titlu manual, Cantitate stoc, Preț, Distribuite, Vândute, Acțiuni (emitere/returnare)

---

## ECRAN: РЕЙТИНГИ (`/Ratings`)

**Sub-secțiuni:**
- Рейтинг сотрудников (Employee Ratings)
- Рейтинг преподавателей (Teacher Ratings)

**Factori de rating:** configurabili în Settings (scor per activitate, per feedback student, etc.)
Blocul Рейтинг apare și în карточка сотрудника / карточка преподавателя.

---

## ECRAN: КОРПОРАТИВНЫЙ ОТДЕЛ (`/Corporate`)

**Funcționalitate:** Gestionare clienți B2B — companii care trimit angajații la cursuri.

**Câmpuri companie:**
ClientId, Id, Name, AdSource, StatusId, Status, Address, EMail, Phone, MasterContractDate, MasterContractNumber, ExtraFields

**BankDetails:** CompanyName, LegalAddress, ActualAddress, Inn, Kpp, BankName, Bic, CorrAccount, CheckingAccount, HeadName, ChiefAccountantName, TaxNotice, Okato, Ogrn, ContactPhone, ContactEmail

**Sub-secțiuni:**
- Список компаний (lista companiilor) — cu filtre și coloane configurabile
- Карточка компании — identică structural cu карточка ученика, adaptată pentru companie
- Studenți corporativi (angajați trimiși la cursuri)
- Grupe/cursuri corporative
- Portal pentru persoana de contact a companiei (similar portalului studentului)

---

## ECRAN: КАРТОЧКА ГРУППЫ (Group Card)

Accesibilă din Расписание sau din карточка ученика → Расписание.

**Header:** Название группы, Дисциплина, Уровень, Филиал, Status

**Informații generale:** Profesor(i), Sală, Program (zile + ore), Dată start/end, Preț implicit, Nr. locuri, Nr. studenți înscriși, Vacancies

**Tab Ученики (Students list):**
- Coloane: Имя, Дата начала, Дата окончания, Статус, Долг, Оплачено, Ответственный
- Acțiuni: adăugare student, transfer, excludere

**Tab Расписание (Schedule):**
- Lista lecțiilor individuale cu: Дата, Время, Преподаватель, Аудитория, Кол-во присутствующих
- Acțiuni per lecție: editare, anulare, adăugare отработка (make-up)
- Журнал посещаемости (prezența per lecție — check/absent/retard)

**Tab Финансы:**
- Цены (prețuri configurate pe grupă)
- Скидки (reduceri active)

**Tab Документы:** Generare contracte, acte, liste

**Bloc Чат группы:** Chat cu toți membrii grupei

---

## ECRAN: ТЕСТИРОВАНИЕ УЧЕНИКОВ (Offline Testing)

Separat de modulul Онлайн-обучение — pentru teste conduse fizic de profesor.

**Структура тестов:**
- Категории → Типы тестов → Skills (cu MaxScore și ValidScore)
- Ex: Категория "Cambridge" → Tip "B2 First" → Skills: Reading (max 40, valid 30), Writing (max 40, valid 30), Listening (max 40, valid 30), Speaking (max 40, valid 30)

**Formular adăugare rezultat test (din карточка ученика):**
- Категория теста (dropdown)
- Тип теста (dropdown dependent)
- Дата
- Дисциплина
- Преподаватель
- Per skill: câmp scor numeric — colorat roșu dacă sub ValidScore
- Комментарий (HTML)

**GetPersonalTestResults returnează:** Id, DateTime, StudentClientId, StudentName, Discipline, TeacherId, TeacherName, TestTypeCategoryId, TestTypeCategoryName, TestTypeId, TestTypeName, Skills (SkillId, SkillName, Score, MaxScore, ValidScore), CommentHtml, CommentText

**Rapoarte de progres (GetEdUnitStudentReports):**
Created, Month, EdUnitId, EdUnitType, EdUnitName, StudentClientId, StudentName, Criterions (CriterionName, Value), CommentHtml, CommentText
- Adăugate din карточка ученика → Тесты → Добавить отчёт об успеваемости
- Evaluare pe stele (1-5) per criteriu + comentariu

---

## ECRAN: БОНУСНЫЕ БАЛЛЫ (Bonus Points / Gamification)

**Principiu:** Studenții acumulează puncte pentru activități (prezență, teme, teste) și le pot folosi la plată.

**Configurare:**
- Prețul unui punct în valută
- Reguli de acumulare (per eveniment: lecție, test, homework)
- Reguli de primire (de la profesor, automat)

**Afișare:** Sold de puncte vizibil în карточка ученика → Личный счёт și în portalul studentului

**Plată cu puncte:** La înregistrarea plății există opțiunea de a folosi puncte bonus ca reducere

---

## ECRAN: IMPORT / EXPORT

**Pagina de import — entități suportate:**
- Ученики (studenți) — CSV cu câmpuri mapabile
- Лиды — CSV
- Группы (grupe) — CSV
- Индивидуальные занятия (lecții individuale) — CSV
- Компании (companii corporate) — CSV
- Библиотека (inventar) — CSV
- Платежи (plăți) — CSV

**Export:** Orice tabel/raport din sistem → Excel (.XLS) prin butonul de export din colțul dreapta sus

---

## NOTIFICĂRI AUTOMATE (Настройки → Оповещения)

**Evenimente care declanșează notificări:**
- Добавление лида (lead nou adăugat)
- Изменение статуса лида (schimbare status lead)
- Запись на пробный урок (înregistrare lecție trial)
- Первый визит (prima vizită)
- Первый платёж (prima plată)
- Долг (datorie apărută)
- День рождения (zi de naștere student/lead)
- Напоминание о занятии (reminder lecție)
- Отмена занятия (lecție anulată)
- Новое домашнее задание (temă nouă)
- Результат теста (rezultat test)

**Destinatari configurabili per eveniment:** Студент, Агент/родитель, Ответственный менеджер, Преподаватель

**Canale:** Email, SMS, WhatsApp, Telegram, Push

---

## ABONAMENTE ȘI PREȚURI (din Настройки → Финансы)

**Tipuri de abonamente (GetPrices):**
Id, Name, Value, Calendar, Units (tip: lecții/zile/luni), Months, Days, Packet (dacă e pachet fix), PartlyPayable (plată parțială permisă), DaysActual, Corporative, Offices

**Tipuri de reduceri (GetDiscounts):** Id, Name, Percent
**Tipuri de suprataxe (GetSurcharges):** Id, Name, Value

**Auto-billing (Автобиллинг):**
- Generare automată facturi la date configurate
- Debitare automată din contul personal al studentului
- Notificare înainte de debitare

**Metode de plată configurabile:** Numerar, Card (terminal fizic), Card online (Yookassa/Tinkoff/Sberbank), QR (СБП), Transfer bancar, Puncte bonus

---

## ECRAN: PORTAL STUDENT (URL separat)

**Header:** Logo, meniu utilizator (dreapta sus), buton Обратиться в школу, buton chat cu contor mesaje necitite

**Secțiuni homepage:**
- **Финансы:** Sold curent (toggle vizibilitate), Счета и оплата онлайн (facturi + buton plată), Пополнить баланс, Поступления и списания
- **Расписание:** Ближайшие занятия (lecții viitoare cu teme), Calendar cu marcaje (trecut/viitor/absent)
- **Cursuri online:** blocuri cursuri disponibile, secțiuni teste, Архив домашних заданий
- **Profil:** Foto + Nume, Файлы (contracte/documente), schimbare parolă, upload foto
- **Anunțuri:** Ultimul anunț al școlii, Закладки (link-uri custom)
- **Grafic performanță:** Test results vizualizate pe 15 date recente

**Configurare portal (admin):**
ShowFinances, ShowDayDescriptions, AllowFillEmptyPersonalInfo, AllowFillEmptyContacts, AllowAddAgents, AllowEditOwnPhoto, EnableClassmatesChats, HideManagerNames, AboutSchoolHtml, Bookmarks, LoginPageColor

---

## APLICAȚIE MOBILĂ (Schoolmaster)

**Disponibil:** Google Play, App Store, AppGallery (Huawei)
**Login:** username + password + subdomain (ex: "school" din school.t8s.ru)

**18 secțiuni:** Login, Pagina principală, Расписание, Страница занятия, Домашнее задание, Чаты, Profil student, Push notificări, Informații generale, Contacte, Date financiare, Rapoarte performanță, Rezultate teste, Materiale didactice, Gestionare fișiere

**Diferențe față de web portal:** Fără "Курсы", teste online, cereri de înscriere. Are: jurnal clasă unificat (prezență, profesor, locație, cost, datorie), plăți+deduceri în listă unificată cu filtrare.

---

## TIPURI UNITATE EDUCAȚIONALĂ (EdUnit)

Un tip unificator acoperă toate:
- Group (Grupă)
- MiniGroup (Mini-grupă)
- OpenLesson (Lecție deschisă)
- Exam (Examen)
- Tour (Excursie)
- Individual (Individual)
- TrialLesson (Lecție trial)

---

## MODUL SALARIZARE PROFESORI

**Tipuri de tarife:**
- Ставка за час (Hourly rate)
- Ставка за занятие (Per-class rate)
- Ставка от количества посетивших (Attendance-based rate)
- Оклад (Fixed salary)
- Смешанные ставки (Mixed/combined rates)

**Modificatori:** Премии (Bonuses), Штрафы (Penalties), Bonusuri de la studenți

---

## INTEGRĂRI (28 confirmarte)

**Telefonie:** Mango Office, CoMagic/UIS, My Calls, Asterisk AMI/PBX, OnPBX

**Plăți:** Yookassa, T-Bank/Tinkoff, Sberbank, СБП (QR), KKM-Server, Terminal bancar, Imprimantă bonuri, 54-ФЗ

**Mesagerie:** SMS Center, WhatsApp (Green API), Telegram Bot, Telegram Personal (Wappi), Max (VK), UniSender, Email corporativ, Viber

**CRM-uri externe:** AmoCRM, Bitrix24

**Alte:** Tilda, 1C (bidirecțional), VKontakte leads, LearningApps, Roistat, PodpiSlon (semnătură electronică), API REST propriu (600 req/30s)

---

## AVANTAJE COMPETITIVE față de Vector Learn

1. **Calendar drag-and-drop** pentru reprogramare lecții
2. **Portal student complet** cu plată online, teste, teme, chat, gamificare
3. **3 tipuri de funnel** (vânzări, statusuri lizi, surse reclame) + LTV/ARPU/Churn
4. **Cascading notifications** (WA → TG → SMS → Push) cu ordine configurabilă
5. **Modul corporativ** separat cu portal pentru persoana de contact
6. **Bibliotecă fizică** cu inventar și transfer între filiale
7. **Integrare 1C** pentru contabilitate externă
8. **Import/Export CSV** pentru toate entitățile
9. **Semnătură electronică** prin PodpiSlon
10. **Multi-channel chat** integrat (intern, grupă, portal, messengerele)

## PUNCTE SLABE

- Interfață complexă, onboarding dificil fără ghid
- Un lead = o singură disciplină (nu multi-discipline)
- Fără plan 100% gratuit
- Export rapoarte financiare lent
- Iconița aplicației mobile nu e personalizabilă

---

*Document generat: 2026-06-01 | Surse: hollipedia.t8s.ru, holyhope.ru, demo.t8s.ru, crmindex.ru, albato.ru, API 2.0 docs*
