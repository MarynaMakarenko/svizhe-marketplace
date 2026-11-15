import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { query, transaction, closePool } from './db.js';

// Демонстраційні дані: категорії, продавці, товари, покупці, замовлення, відгуки.
// Пароль усіх демо-акаунтів однаковий і вказаний у README.
export const DEMO_PASSWORD = 'demo1234';

const CATEGORIES = [
  ['Овочі та фрукти', 'ovochi-frukty', '🥕'],
  ['Молочні продукти', 'molochni', '🧀'],
  ["М'ясо та ковбаси", 'miaso', '🥩'],
  ['Випічка', 'vypichka', '🥖'],
  ['Мед і варення', 'med-varennia', '🍯'],
  ['Яйця та птиця', 'yaitsia-ptytsia', '🥚'],
  ['Напої', 'napoi', '🧃'],
  ['Консервація', 'konservatsiia', '🫙'],
];

const SELLERS = [
  {
    email: 'ferma@svizhe.ua', owner: 'Тарас Гайовий', phone: '+380 67 111 22 33',
    shop: 'Ферма «Зелений гай»', city: 'Бровари', status: 'approved',
    about: 'Сімейна ферма під Києвом. Вирощуємо овочі та зелень без пестицидів, збираємо врожай у день доставки.',
  },
  {
    email: 'syrovarnia@svizhe.ua', owner: 'Марія Гуцул', phone: '+380 50 222 33 44',
    shop: 'Сироварня «Карпатська»', city: 'Яремче', status: 'approved',
    about: 'Крафтові сири з молока карпатських корів і кіз. Витримка у власному льосі від 2 до 12 місяців.',
  },
  {
    email: 'pekarnia@svizhe.ua', owner: 'Ігор Пекар', phone: '+380 63 333 44 55',
    shop: 'Пекарня «Тепла хата»', city: 'Київ', status: 'approved',
    about: 'Хліб на заквасці довгої ферментації та випічка на вершковому маслі. Печемо щоранку.',
  },
  {
    email: 'pasika@svizhe.ua', owner: 'Олег Мельник', phone: '+380 97 444 55 66',
    shop: 'Пасіка Мельників', city: 'Полтава', status: 'approved',
    about: 'Три покоління бджолярів. Мед із власної пасіки на 120 вуликів, варення за бабусиними рецептами.',
  },
  {
    email: 'ptytsia@svizhe.ua', owner: 'Наталія Добра', phone: '+380 68 555 66 77',
    shop: 'Господарство «Добра птиця»', city: 'Вінниця', status: 'approved',
    about: "Птиця вільного вигулу, домашні яйця та м'ясні вироби власного виробництва.",
  },
  {
    email: 'sady@svizhe.ua', owner: 'Петро Садовий', phone: '+380 66 666 77 88',
    shop: 'Сади Поділля', city: 'Хмельницький', status: 'pending',
    about: 'Соки прямого віджиму та узвари з власних садів.',
  },
];

// [продавець, категорія (slug), назва, ціна, одиниця, залишок, емодзі, опис, фото]
// Фото лежить у backend/seed-images/<фото>.jpg; якщо файлу немає, малюється картка з емодзі.
const PRODUCTS = [
  [0, 'ovochi-frukty', 'Помідори рожеві', 89, 'кг', 40, '🍅', "Солодкі м'ясисті помідори сорту «Рожевий гігант». Зібрані зранку в день доставки.", 'tomatoes'],
  [0, 'ovochi-frukty', 'Огірки хрусткі', 65, 'кг', 55, '🥒', 'Короткоплідні огірки з тонкою шкіркою. Підходять і для салату, і для засолювання.', 'cucumbers'],
  [0, 'ovochi-frukty', 'Картопля молода', 32, 'кг', 200, '🥔', 'Молода картопля сорту «Белла роса». Розсипчаста, швидко вариться.', 'potatoes'],
  [0, 'ovochi-frukty', 'Морква', 28, 'кг', 120, '🥕', 'Солодка соковита морква. Мита, відсортована.', 'carrots'],
  [0, 'ovochi-frukty', 'Яблука «Джонаголд»', 45, 'кг', 90, '🍎', 'Ароматні кисло-солодкі яблука з власного саду. Без воску та обробки.', 'apples'],
  [0, 'ovochi-frukty', 'Полуниця', 180, 'кг', 0, '🍓', 'Сезонна полуниця сорту «Альбіон». Зараз не сезон — чекайте в травні.', 'strawberries'],
  [0, 'ovochi-frukty', 'Зелень мікс', 35, 'пучок', 60, '🌿', 'Кріп, петрушка та зелена цибуля в одному пучку.', 'herbs'],
  [0, 'konservatsiia', 'Томати у власному соку', 95, 'банка 0,7 л', 35, '🫙', 'Помідори з нашого городу, сіль і нічого зайвого.', 'tomatoes-canned'],
  [1, 'molochni', 'Бринза карпатська', 320, 'кг', 25, '🧀', 'Класична овеча бринза з полонини. Помірно солона, розсипчаста.', 'brynza'],
  [1, 'molochni', 'Сир козячий витриманий', 540, 'кг', 12, '🧀', 'Твердий козячий сир, витримка 6 місяців. Горіховий присмак.', 'goat-cheese'],
  [1, 'molochni', 'Сметана домашня 25%', 110, 'банка 0,5 л', 30, '🥛', 'Густа сметана з вершків. Ложка стоїть.', 'sour-cream'],
  [1, 'molochni', 'Масло вершкове 82%', 150, 'брусок 200 г', 40, '🧈', 'Збите вручну масло з фермерських вершків.', 'butter'],
  [1, 'molochni', 'Йогурт натуральний', 58, 'банка 0,35 л', 48, '🥣', 'Без цукру та загущувачів — лише молоко й закваска.', 'yogurt'],
  [1, 'molochni', 'Молоко коров\'яче', 42, 'л', 60, '🥛', 'Пастеризоване молоко жирністю 3,6–4%. Зберігається 5 днів.', 'milk'],
  [2, 'vypichka', 'Хліб житній на заквасці', 68, 'шт', 30, '🍞', 'Ферментація 24 години. Щільний м\'якуш, хрустка скоринка. 600 г.', 'rye-bread'],
  [2, 'vypichka', 'Багет французький', 42, 'шт', 45, '🥖', 'Класичний багет на пшеничному борошні вищого ґатунку. 280 г.', 'baguette'],
  [2, 'vypichka', 'Круасан масляний', 48, 'шт', 60, '🥐', 'На справжньому вершковому маслі 82%, 27 шарів тіста.', 'croissant'],
  [2, 'vypichka', 'Пиріг з вишнею', 210, 'шт', 10, '🥧', 'Пісочне тісто і кисло-солодка начинка з вишні. 700 г.', 'cherry-pie'],
  [2, 'vypichka', 'Булочка з корицею', 39, 'шт', 50, '🧁', 'Синабон по-домашньому з вершковою глазур\'ю.', 'cinnamon-roll'],
  [2, 'vypichka', 'Печиво вівсяне', 85, 'упаковка 300 г', 25, '🍪', 'З родзинками та медом, без маргарину.', 'oat-cookies'],
  [3, 'med-varennia', 'Мед липовий', 240, 'банка 0,5 л', 50, '🍯', 'Світлий ароматний мед збору цього року. Не нагрівався.', 'honey-linden'],
  [3, 'med-varennia', 'Мед гречаний', 220, 'банка 0,5 л', 45, '🍯', 'Темний мед з характерною гірчинкою. Багатий на залізо.', 'honey-buckwheat'],
  [3, 'med-varennia', 'Мед у стільниках', 310, 'рамка 400 г', 15, '🐝', 'Стільниковий мед просто з вулика.', 'honeycomb'],
  [3, 'med-varennia', 'Варення малинове', 135, 'банка 0,4 л', 30, '🫐', 'Малина й цукор у пропорції 2:1. Варимо малими партіями.', 'raspberry-jam'],
  [3, 'med-varennia', 'Джем абрикосовий', 120, 'банка 0,4 л', 28, '🍑', 'Густий джем зі стиглих абрикосів з мигдалем.', 'apricot-jam'],
  [3, 'napoi', 'Медовуха безалкогольна', 75, 'пляшка 0,5 л', 40, '🍹', 'Освіжаючий напій на меду з м\'ятою та лимоном.', 'honey-drink'],
  [4, 'yaitsia-ptytsia', 'Яйця курячі домашні', 78, 'десяток', 80, '🥚', 'Від курей вільного вигулу. Яскравий жовток.', 'eggs'],
  [4, 'yaitsia-ptytsia', 'Яйця перепелині', 62, 'лоток 20 шт', 35, '🪺', 'Свіжі перепелині яйця, зібрані цього тижня.', 'quail-eggs'],
  [4, 'yaitsia-ptytsia', 'Курка домашня', 165, 'кг', 20, '🍗', 'Охолоджена тушка 1,8–2,2 кг. Зернова відгодівля.', 'chicken'],
  [4, 'miaso', 'Ковбаски мисливські', 420, 'кг', 18, '🌭', 'Тонкі копчені ковбаски зі свинини з часником і перцем. Без консервантів.', 'sausage'],
  [4, 'miaso', "Бекон сиров'ялений", 340, 'кг', 22, '🥓', "Свиняча грудинка з м'ясними прошарками, нарізана тонкими скибками.", 'bacon'],
  [4, 'miaso', 'Буженина запечена', 460, 'кг', 9, '🥩', 'Свинячий окіст, запечений з гірчицею та травами.', 'buzhenina'],
  [5, 'napoi', 'Сік яблучний прямого віджиму', 95, 'пляшка 1 л', 40, '🧃', 'Без цукру та води. Пастеризований.', 'apple-juice'],
  [5, 'napoi', 'Узвар із сухофруктів', 70, 'пляшка 1 л', 30, '🍎', 'Яблука, груші, сливи — як у дитинстві.', 'uzvar'],
  [0, 'ovochi-frukty', 'Капуста білокачанна', 24, 'кг', 150, '🥬', 'Щільні качани пізнього сорту. Добре зберігається, підходить для квашення.', 'cabbage'],
  [0, 'ovochi-frukty', 'Буряк столовий', 22, 'кг', 130, '🥗', 'Темно-бордовий солодкий буряк сорту «Бордо». Для борщу та вінегрету.', 'beetroot'],
  [0, 'ovochi-frukty', 'Цибуля ріпчаста', 26, 'кг', 160, '🧅', 'Гостра жовта цибуля. Суха, добре лежить до весни.', 'onions'],
  [0, 'ovochi-frukty', 'Часник', 190, 'кг', 30, '🧄', 'Озимий часник сорту «Любаша». Великі соковиті зубки.', 'garlic'],
  [0, 'ovochi-frukty', 'Перець солодкий', 98, 'кг', 45, '🫑', "Товстостінний м'ясистий перець. Червоний і жовтий у міксі.", 'bell-pepper'],
  [0, 'ovochi-frukty', 'Кабачки молоді', 38, 'кг', 70, '🥒', 'Молоді кабачки з ніжною шкіркою, без насіння.', 'zucchini'],
  [0, 'ovochi-frukty', 'Гарбуз мускатний', 36, 'кг', 85, '🎃', "Солодкий помаранчевий м'якуш. Для каші, супу-пюре та випічки.", 'pumpkin'],
  [0, 'ovochi-frukty', 'Груші «Конференція»', 62, 'кг', 60, '🍐', "Соковиті груші з маслянистим м'якушем із власного саду.", 'pears'],
  [0, 'ovochi-frukty', 'Сливи «Угорка»', 55, 'кг', 40, '🍑', "Пізня слива зі щільним м'якушем. Кісточка легко відділяється.", 'plums'],
  [0, 'ovochi-frukty', 'Малина', 95, 'лоток 250 г', 24, '🍇', 'Ремонтантна малина осіннього збору. Збираємо в день доставки.', 'raspberries'],
  [0, 'konservatsiia', 'Огірки мариновані', 88, 'банка 0,7 л', 42, '🥒', 'Хрусткі огірочки з кропом, часником і листям смородини.', 'pickles'],
  [0, 'konservatsiia', 'Капуста квашена', 60, 'банка 0,9 л', 38, '🥬', 'Квасимо в дубовій діжці з морквою та журавлиною.', 'sauerkraut'],
  [0, 'konservatsiia', 'Аджика домашня', 82, 'банка 0,3 л', 26, '🌶️', 'Печений перець, помідори, часник і гострий перчик. Без оцту.', 'adjika'],
  [1, 'molochni', 'Сир кисломолочний 9%', 145, 'кг', 28, '🧀', 'Зернистий домашній сир із цільного молока. Для сирників і вареників.', 'cottage-cheese'],
  [1, 'molochni', 'Кефір 2,5%', 46, 'пляшка 0,5 л', 40, '🥛', 'На живій кефірній заквасці. Зберігається 7 днів.', 'kefir'],
  [1, 'molochni', 'Ряжанка 4%', 52, 'пляшка 0,5 л', 32, '🥛', 'З пряженого в печі молока, з карамельним присмаком.', 'ryazhenka'],
  [1, 'molochni', 'Моцарела', 98, 'куля 125 г', 36, '🧀', 'Свіжа моцарела в розсолі. Робимо двічі на тиждень.', 'mozzarella'],
  [1, 'molochni', 'Сир із блакитною пліснявою', 680, 'кг', 8, '🧀', "Витримка 3 місяці. Пікантний смак і кремова м'якоть.", 'blue-cheese'],
  [2, 'vypichka', 'Хліб пшеничний на заквасці', 72, 'шт', 28, '🍞', "Пористий м'якуш і тонка хрустка скоринка. 700 г.", 'wheat-bread'],
  [2, 'vypichka', 'Паляниця', 54, 'шт', 35, '🍞', "Традиційна паляниця з «козирком». Пухкий м'якуш. 500 г.", 'palianytsia'],
  [2, 'vypichka', 'Чіабата', 46, 'шт', 40, '🥖', "Італійський хліб на оливковій олії з пористим м'якушем. 300 г.", 'ciabatta'],
  [2, 'vypichka', 'Булочки з насінням', 62, 'упаковка 6 шт', 30, '🥯', 'Пшеничні булочки з кунжутом, маком і соняшниковим насінням.', 'seed-rolls'],
  [2, 'vypichka', 'Штрудель яблучний', 185, 'шт', 12, '🍎', 'Тонке витяжне тісто, яблука, кориця та родзинки. 500 г.', 'strudel'],
  [2, 'vypichka', 'Бублики з маком', 58, 'упаковка 4 шт', 26, '🥯', "Заварні бублики з маком. Хрустка скоринка, тягучий м'якуш.", 'bagels'],
  [3, 'med-varennia', 'Мед акацієвий', 280, 'банка 0,5 л', 34, '🍯', 'Прозорий і рідкий, довго не кристалізується. Ніжний смак.', 'honey-acacia'],
  [3, 'med-varennia', 'Мед квітковий', 210, 'банка 0,5 л', 55, '🍯', "Мед із лугового різнотрав'я. Золотистий, з м'яким квітковим ароматом.", 'honey-flower'],
  [3, 'med-varennia', 'Варення полуничне', 130, 'банка 0,4 л', 26, '🍓', 'Цілі ягоди в густому сиропі. Без барвників і загущувачів.', 'strawberry-jam'],
  [3, 'med-varennia', 'Варення вишневе', 140, 'банка 0,4 л', 24, '🍒', 'Вишня без кісточок, варена у три прийоми.', 'cherry-jam'],
  [3, 'napoi', "Чай трав'яний «Пасічний»", 95, 'пачка 50 г', 30, '🍵', "Липовий цвіт, чебрець, м'ята і меліса з околиць пасіки.", 'herbal-tea'],
  [4, 'yaitsia-ptytsia', 'Філе куряче', 235, 'кг', 24, '🍗', 'Охолоджене філе без шкіри та кісток. Фасуємо по 500–700 г.', 'chicken-fillet'],
  [4, 'yaitsia-ptytsia', 'Стегна курячі', 148, 'кг', 30, '🍗', 'Соковиті стегна домашньої курки. Для запікання та грилю.', 'chicken-legs'],
  [4, 'miaso', 'Шинка домашня', 420, 'кг', 14, '🍖', 'Варено-копчена шинка зі свинячого окосту. Без фосфатів.', 'ham'],
  [4, 'miaso', "Ковбаса сиров'ялена", 620, 'кг', 12, '🌭', "Свинина з паприкою та часником, в'ялена 30 днів.", 'dry-sausage'],
  [5, 'napoi', 'Сік виноградний', 110, 'пляшка 1 л', 25, '🍇', 'Із винограду сорту «Ізабелла». Без цукру.', 'grape-juice'],
];

const BUYERS = [
  { email: 'buyer@svizhe.ua', name: 'Олена Коваль', phone: '+380 93 123 45 67' },
  { email: 'andrii@svizhe.ua', name: 'Андрій Шевченко', phone: '+380 95 765 43 21' },
];

// [покупець, статус, скільки днів тому, [[індекс товару, кількість], ...]]
const ORDERS = [
  [0, 'delivered', 14, [[0, 2], [1, 1], [6, 2]]],
  [0, 'delivered', 12, [[8, 1], [11, 2]]],
  [0, 'delivered', 9, [[14, 1], [16, 4]]],
  [0, 'shipped', 2, [[20, 1], [23, 2]]],
  [0, 'new', 0, [[26, 2], [29, 1]]],
  [1, 'delivered', 10, [[20, 2], [22, 1]]],
  [1, 'delivered', 7, [[26, 3], [28, 2]]],
  [1, 'delivered', 6, [[14, 2], [17, 1]]],
  [1, 'confirmed', 1, [[9, 1], [12, 3]]],
  [1, 'cancelled', 4, [[2, 5]]],
];

// [покупець, індекс товару, оцінка, текст]
const REVIEWS = [
  [0, 0, 5, 'Справжній смак помідорів, як у бабусі на городі. Беру вдруге.'],
  [0, 1, 4, 'Хрусткі й свіжі, кілька штук були завеликі.'],
  [0, 8, 5, 'Найкраща бринза, яку я куштувала поза Карпатами.'],
  [0, 11, 5, 'Масло пахне вершками, а не холодильником.'],
  [0, 14, 5, 'Хліб не черствіє чотири дні. Скоринка чудова.'],
  [0, 16, 4, 'Смачні, але доїхали трохи прим\'яті.'],
  [1, 20, 5, 'Ароматний, не засахарений. Дітям дуже сподобався.'],
  [1, 22, 5, 'Вперше куштував мед у стільниках — супер.'],
  [1, 26, 5, 'Жовтки майже помаранчеві. Магазинні після таких не хочеться.'],
  [1, 28, 4, 'Курка хороша, упаковка могла б бути надійнішою.'],
  [1, 14, 5, 'Кисленький, щільний, ідеально до борщу.'],
  [1, 17, 5, 'Вишні багато, тісто тонке. З\'їли за вечір.'],
];

const GRADIENTS = [
  ['#FFE9D6', '#FFD1B0'], ['#E3F4DC', '#C6E7B8'], ['#FFF3C9', '#FFE08A'],
  ['#E1F0FA', '#BFDDF2'], ['#FBE3EA', '#F5C3D0'], ['#EDE6FA', '#D6C8F2'],
];

// Запасна картка товару: емодзі на кольоровому тлі у форматі SVG.
function productSvg(emoji, i) {
  const [a, b] = GRADIENTS[i % GRADIENTS.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>
  </linearGradient></defs>
  <rect width="600" height="450" fill="url(#g)"/>
  <circle cx="300" cy="225" r="150" fill="#ffffff" fill-opacity="0.45"/>
  <text x="300" y="225" font-size="170" text-anchor="middle" dominant-baseline="central">${emoji}</text>
</svg>
`;
}

const SEED_IMAGES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../seed-images');

// Копіює фото товару в каталог uploads і повертає його адресу.
async function productImage(photo, emoji, i) {
  try {
    await fs.copyFile(path.join(SEED_IMAGES, `${photo}.jpg`), path.join(config.uploadsDir, `demo-${photo}.jpg`));
    return `/uploads/demo-${photo}.jpg`;
  } catch {
    await fs.writeFile(path.join(config.uploadsDir, `demo-${photo}.svg`), productSvg(emoji, i));
    return `/uploads/demo-${photo}.svg`;
  }
}

export async function seed() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await fs.mkdir(config.uploadsDir, { recursive: true });

  await transaction(async (db) => {
    const one = async (sql, params) => (await db.query(sql, params)).rows[0];

    await db.query(
      `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, 'admin')`,
      ['admin@svizhe.ua', hash, 'Адміністратор'],
    );

    const categoryIds = {};
    for (const [name, slug, icon] of CATEGORIES) {
      categoryIds[slug] = (
        await one('INSERT INTO categories (name, slug, icon) VALUES ($1, $2, $3) RETURNING id', [name, slug, icon])
      ).id;
    }

    const sellerIds = [];
    for (const s of SELLERS) {
      const user = await one(
        `INSERT INTO users (email, password_hash, full_name, phone, role)
         VALUES ($1, $2, $3, $4, 'seller') RETURNING id`,
        [s.email, hash, s.owner, s.phone],
      );
      sellerIds.push(
        (
          await one(
            `INSERT INTO sellers (user_id, shop_name, description, city, status)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [user.id, s.shop, s.about, s.city, s.status],
          )
        ).id,
      );
    }

    const products = [];
    for (const [i, [seller, slug, name, price, unit, stock, emoji, description, photo]] of PRODUCTS.entries()) {
      const imageUrl = await productImage(photo, emoji, i);
      const row = await one(
        `INSERT INTO products (seller_id, category_id, name, description, price, unit, stock, image_url, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() - ($9 || ' hours')::INTERVAL) RETURNING id`,
        [sellerIds[seller], categoryIds[slug], name, description, price, unit, stock, imageUrl, 3 + ((i * 37) % PRODUCTS.length) * 5],
      );
      products.push({ id: row.id, seller: sellerIds[seller], name, price, unit });
    }

    const buyerIds = [];
    for (const b of BUYERS) {
      buyerIds.push(
        (
          await one(
            `INSERT INTO users (email, password_hash, full_name, phone, role)
             VALUES ($1, $2, $3, $4, 'buyer') RETURNING id`,
            [b.email, hash, b.name, b.phone],
          )
        ).id,
      );
    }

    const addresses = ['м. Київ, вул. Володимирська, 60, кв. 12', 'м. Київ, просп. Глушкова, 4д, кв. 87'];
    for (const [buyer, status, daysAgo, lines] of ORDERS) {
      const items = lines.map(([idx, quantity]) => ({ ...products[idx], quantity }));
      const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
      const order = await one(
        `INSERT INTO orders (buyer_id, seller_id, status, total, delivery_address, phone, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now() - ($7 || ' days')::INTERVAL, now() - ($7 || ' days')::INTERVAL)
         RETURNING id`,
        [buyerIds[buyer], items[0].seller, status, total, addresses[buyer], BUYERS[buyer].phone, daysAgo],
      );
      for (const i of items) {
        await db.query(
          `INSERT INTO order_items (order_id, product_id, product_name, unit, price, quantity)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [order.id, i.id, i.name, i.unit, i.price, i.quantity],
        );
      }
    }

    for (const [buyer, idx, rating, comment] of REVIEWS) {
      await db.query(
        `INSERT INTO reviews (product_id, user_id, rating, comment, created_at)
         VALUES ($1, $2, $3, $4, now() - ($5 || ' days')::INTERVAL)`,
        [products[idx].id, buyerIds[buyer], rating, comment, 1 + ((idx * 3) % 6)],
      );
    }
  });
}

export async function seedIfEmpty() {
  const { rows } = await query('SELECT COUNT(*) AS n FROM users');
  if (rows[0].n > 0) return false;
  await seed();
  console.log('[seed] базу заповнено демонстраційними даними');
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedIfEmpty()
    .then((done) => {
      if (!done) console.log('[seed] у базі вже є дані — нічого не змінено');
    })
    .catch((err) => {
      console.error('[seed] помилка:', err.message);
      process.exitCode = 1;
    })
    .finally(closePool);
}
