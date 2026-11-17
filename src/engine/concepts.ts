import { CALC_CONCEPTS } from './concepts-calc';
import { ConceptId, SolutionStep } from './types';
import { localized, msg } from '../i18n';

/**
 * The concept library: what Lera sends a student back to when a mark is a
 * real gap. Each entry is a three-minute review — the idea, the mistake that
 * usually goes with it, and one worked example. Mini practice is generated
 * separately (see generate.ts) and checked by the same engine as everything else.
 *
 * `$…$` wraps maths in linear text; the UI typesets it.
 */
export interface Concept {
  id: ConceptId;
  title: string;
  /** One line for the tooltip and the review queue. */
  short: string;
  /** Two or three short paragraphs. */
  explain: string[];
  /** The mistake people make, and what is true instead. */
  trap?: { wrong: string; right: string; note: string };
  example: { prompt: string; given: string; steps: Pick<SolutionStep, 'line' | 'why'>[] };
  minutes: number;
  /** Words in a student's notes that suggest a topic is about this concept. */
  keywords: string[];
}

const ALGEBRA_CONCEPTS: Partial<Record<ConceptId, Concept>> = {
  'inverse-operations': {
    id: 'inverse-operations',
    title: msg('Moving terms across the equals sign'),
    short: 'A term changes sign when it crosses over, because you do the opposite to both sides.',
    explain: [
      msg('An equation is a balance. Whatever you do to one side, you do to the other, that is the only rule, and “moving” a term is shorthand for it.'),
      msg('To get rid of $+ 4$ on the left you subtract 4 from both sides. The left loses its 4; the right gains a $- 4$. It looks as if the 4 jumped across and changed sign.'),
      msg('So: added terms arrive subtracted, subtracted terms arrive added. And a number that multiplies the unknown is undone by dividing, not by subtracting.'),
    ],
    trap: { wrong: '3x + 4 = 19  →  3x = 23', right: '3x + 4 = 19  →  3x = 15', note: msg('The 4 crossed over but kept its sign.') },
    example: {
      prompt: msg('Solve for x'),
      given: '5x - 7 = 18',
      steps: [
        { line: '5x = 25', why: msg('Add 7 to both sides. The −7 arrives on the right as +7.') },
        { line: 'x = 5', why: 'x is multiplied by 5, so divide both sides by 5.' },
      ],
    },
    minutes: 3,
    keywords: ['linear equation', 'solving equation', 'solve for', 'one-step', 'two-step', 'transpos', 'inverse operation', 'rearrang'],
  },
  balance: {
    id: 'balance',
    title: msg('Doing the same to every term'),
    short: msg('Dividing or multiplying an equation applies to every term on both sides.'),
    explain: [
      msg('When you divide an equation by 2, you are dividing the whole left side and the whole right side, which means every term in them.'),
      msg('It is tempting to divide only the term you care about. $2x + 6 = 10$ divided by 2 is $x + 3 = 5$, not $x + 6 = 5$.'),
      'A safe habit: move the plain numbers away first, so that when you divide there is only one term on each side.',
    ],
    trap: { wrong: '2x + 6 = 10  →  x + 6 = 5', right: '2x + 6 = 10  →  x + 3 = 5', note: msg('The 6 has to be divided as well.') },
    example: {
      prompt: msg('Solve for x'),
      given: '3x + 9 = 21',
      steps: [
        { line: '3x = 12', why: msg('Subtract 9 from both sides first.') },
        { line: 'x = 4', why: msg('Now there is one term on each side, so dividing by 3 is safe.') },
      ],
    },
    minutes: 3,
    keywords: ['both sides', 'balance', 'divide both', 'multiply both'],
  },
  distributive: {
    id: 'distributive',
    title: msg('Multiplying out brackets'),
    short: msg('The term outside multiplies every term inside, and a negative outside flips every sign.'),
    explain: [
      'A number in front of a bracket multiplies everything in it: $3(x + 2)$ means three lots of $x$ and three lots of 2, so $3x + 6$.',
      'A minus sign in front of a bracket is a hidden $-1$. It multiplies every term too, so every sign inside flips: $-(x - 5)$ is $-x + 5$.',
      msg('Most errors here are in the second term: the first gets multiplied and the rest is copied down unchanged.'),
    ],
    trap: { wrong: '-2(x - 3)  →  -2x - 6', right: '-2(x - 3)  →  -2x + 6', note: msg('Negative times negative is positive.') },
    example: {
      prompt: msg('Expand and simplify'),
      given: '4(x + 2) - 3(x - 1)',
      steps: [
        { line: '4x + 8 - 3x + 3', why: '4 multiplies both terms; −3 multiplies both terms, and −3 × −1 = +3.' },
        { line: 'x + 11', why: msg('Collect the x terms and the numbers.') },
      ],
    },
    minutes: 3,
    keywords: ['distribut', 'bracket', 'parenthes', 'expand', 'multiply out', 'remove bracket'],
  },
  'like-terms': {
    id: 'like-terms',
    title: msg('Collecting like terms'),
    short: msg('Only terms with exactly the same letters and powers can be added together.'),
    explain: [
      msg('Like terms have the same letters raised to the same powers: $3x$ and $5x$ are alike; $3x$ and $5$ are not; $3x$ and $5x^2$ are not.'),
      msg('To add like terms, add the numbers in front and keep the letter part exactly as it is: $3x + 5x = 8x$. The power does not change, that only happens when you multiply.'),
      msg('Unlike terms simply stay next to each other. $2x + 3$ is already as simple as it gets.'),
    ],
    trap: { wrong: '2x + 3  →  5x', right: '2x + 3  stays  2x + 3', note: 'A number and an x-term are different kinds of thing.' },
    example: {
      prompt: msg('Simplify'),
      given: '4x + 7 - x + 2',
      steps: [
        { line: '4x - x + 7 + 2', why: msg('Group the x terms together and the numbers together.') },
        { line: '3x + 9', why: '4x − x = 3x and 7 + 2 = 9.' },
      ],
    },
    minutes: 3,
    keywords: ['like term', 'collect', 'combine', 'simplif', 'algebraic expression'],
  },
  'signed-arithmetic': {
    id: 'signed-arithmetic',
    title: msg('Working with negative numbers'),
    short: msg('Two negatives multiply to a positive; subtracting a negative is adding.'),
    explain: [
      msg('Multiplying or dividing: same signs give a positive, different signs give a negative. $(-3)(-4) = 12$, $(-3)(4) = -12$.'),
      msg('Subtracting a negative is the same as adding: $5 - (-2) = 7$. Two minus signs side by side become a plus.'),
      msg('When a line has several signs, slow down for one line and write the signs out before combining anything. Most of these marks are speed, not understanding.'),
    ],
    trap: { wrong: '-3 - 4  →  1', right: '-3 - 4  →  -7', note: msg('Start at −3 and go four further down.') },
    example: {
      prompt: msg('Work out'),
      given: '(-3)(-4) - 5',
      steps: [
        { line: '12 - 5', why: msg('Negative times negative is positive.') },
        { line: '7', why: msg('Then subtract.') },
      ],
    },
    minutes: 2,
    keywords: ['negative', 'integer', 'directed number', 'signed number'],
  },
  arithmetic: {
    id: 'arithmetic',
    title: msg('Calculation accuracy'),
    short: msg('The method was right; one number came out wrong.'),
    explain: [
      'A calculation slip is not a gap in what you know. It usually means two steps were done in one, or the line was copied quickly.',
      msg('The cheapest fix is to check the one line where numbers get combined: say the sum to yourself before writing the result.'),
      msg('If slips keep landing on the same kind of line, I will put a small reminder there rather than a lesson.'),
    ],
    example: {
      prompt: msg('Work out'),
      given: '7 * 8 - 19',
      steps: [
        { line: '56 - 19', why: msg('Multiply first.') },
        { line: '37', why: msg('Then subtract. 56 − 20 is 36, add one back.') },
      ],
    },
    minutes: 1,
    keywords: ['arithmetic', 'calculation'],
  },
  'exponent-rules': {
    id: 'exponent-rules',
    title: msg('Laws of exponents'),
    short: msg('Multiplying powers adds exponents; a power of a power multiplies them.'),
    explain: [
      msg('An exponent counts how many times something is multiplied. $x^2 * x^3$ is two x’s times three x’s, five in all, so $x^5$. Multiplying adds the exponents.'),
      'A power of a power repeats the whole thing: $(x^2)^3$ is $x^2 * x^2 * x^2 = x^6$. That multiplies the exponents.',
      'A power outside a bracket applies to everything inside, numbers included: $(2x)^3 = 8x^3$. Dividing powers subtracts: $x^5 / x^2 = x^3$.',
    ],
    trap: { wrong: 'x^2 * x^3  →  x^6', right: 'x^2 * x^3  →  x^5', note: msg('Count the x’s: two and three more.') },
    example: {
      prompt: msg('Simplify'),
      given: '(3x^2)^2 * x',
      steps: [
        { line: '9x^4 * x', why: msg('The square applies to the 3 and to x²: 3² = 9, (x²)² = x⁴.') },
        { line: '9x^5', why: 'x is x¹, and multiplying adds the exponents: 4 + 1.' },
      ],
    },
    minutes: 3,
    keywords: ['exponent', 'power', 'indices', 'index law', 'laws of'],
  },
  'expanding-binomials': {
    id: 'expanding-binomials',
    title: msg('Expanding two brackets'),
    short: msg('Every term in the first bracket multiplies every term in the second.'),
    explain: [
      msg('Two brackets side by side are multiplied. Each term of the first meets each term of the second: $(x + 3)(x - 2)$ makes four products.'),
      msg('Squaring a bracket means multiplying it by itself: $(x + 3)^2 = (x + 3)(x + 3) = x^2 + 6x + 9$. The middle term comes from the two cross products.'),
      msg('The classic shortcut that does not work is squaring each term on its own. $(x + 3)^2$ is not $x^2 + 9$, try $x = 1$: 16 against 10.'),
    ],
    trap: { wrong: '(x + 3)^2  →  x^2 + 9', right: '(x + 3)^2  →  x^2 + 6x + 9', note: msg('The cross terms 3x and 3x are missing.') },
    example: {
      prompt: msg('Expand and simplify'),
      given: '(x + 4)(x - 1)',
      steps: [
        { line: 'x^2 - x + 4x - 4', why: 'x·x, x·(−1), 4·x, 4·(−1).' },
        { line: 'x^2 + 3x - 4', why: msg('Collect the two middle terms.') },
      ],
    },
    minutes: 3,
    keywords: ['binomial', 'foil', 'double bracket', 'perfect square', 'product of two', 'squaring a bracket', 'special product'],
  },
  factoring: {
    id: 'factoring',
    title: msg('Factorising quadratics'),
    short: msg('Find two numbers that multiply to the last term and add to the middle one.'),
    explain: [
      msg('Factorising is expanding in reverse. For $x^2 + bx + c$ you want two numbers that multiply to $c$ and add to $b$; they go in the brackets.'),
      msg('Signs carry the information. If $c$ is positive the two numbers share a sign (the sign of $b$). If $c$ is negative they have opposite signs.'),
      msg('Always check by multiplying the brackets back out. And look for a common factor first, $2x^2 + 6x$ is $2x(x + 3)$ before anything else.'),
    ],
    trap: { wrong: 'x^2 - 5x + 6  →  (x + 2)(x + 3)', right: 'x^2 - 5x + 6  →  (x - 2)(x - 3)', note: msg('They must add to −5, so both are negative.') },
    example: {
      prompt: msg('Factorise'),
      given: 'x^2 + 2x - 15',
      steps: [
        { line: '(x + 5)(x - 3)', why: '5 and −3 multiply to −15 and add to 2.' },
      ],
    },
    minutes: 3,
    keywords: ['factor', 'factoris', 'factoriz', 'trinomial', 'common factor', 'difference of two squares'],
  },
  'zero-product': {
    id: 'zero-product',
    title: msg('Solutions from factors'),
    short: msg('If a product is zero, one of the factors is zero, so each bracket gives a solution.'),
    explain: [
      msg('If two things multiply to give zero, at least one of them must be zero. That is why we factorise quadratics: it turns one hard equation into two easy ones.'),
      msg('From $(x - 2)(x + 5) = 0$ you get $x - 2 = 0$ or $x + 5 = 0$, so $x = 2$ or $x = -5$. The solution has the opposite sign to the number in the bracket.'),
      msg('This only works when the other side is zero. $(x - 2)(x + 5) = 6$ tells you nothing about the brackets individually.'),
    ],
    trap: { wrong: '(x - 2)(x + 5) = 0  →  x = -2, x = 5', right: '(x - 2)(x + 5) = 0  →  x = 2, x = -5', note: msg('Set each bracket to zero and solve it.') },
    example: {
      prompt: msg('Solve for x'),
      given: 'x^2 - x - 6 = 0',
      steps: [
        { line: '(x - 3)(x + 2) = 0', why: '−3 and 2 multiply to −6 and add to −1.' },
        { line: 'x = 3 or x = -2', why: msg('Each bracket can be zero.') },
      ],
    },
    minutes: 3,
    keywords: ['quadratic equation', 'zero product', 'null factor', 'roots', 'solving quadratic', 'solve by factor'],
  },
  'square-root-pm': {
    id: 'square-root-pm',
    title: msg('Square roots give two answers'),
    short: 'x² = 9 is true for 3 and for −3. Write ±.',
    explain: [
      msg('Squaring removes the sign: $3^2 = 9$ and $(-3)^2 = 9$. So when you undo a square, both numbers are possible.'),
      msg('Whenever you take the square root of both sides of an equation, write ±: $x^2 = 9$ gives $x = ±3$.'),
      msg('The calculator’s √ button only shows the positive root. The equation still has two solutions.'),
    ],
    trap: { wrong: 'x^2 = 9  →  x = 3', right: 'x^2 = 9  →  x = ±3', note: '−3 squared is also 9.' },
    example: {
      prompt: msg('Solve for x'),
      given: '2x^2 = 50',
      steps: [
        { line: 'x^2 = 25', why: msg('Divide both sides by 2.') },
        { line: 'x = ±5', why: msg('Take the square root, both signs.') },
      ],
    },
    minutes: 2,
    keywords: ['square root', 'perfect square', 'plus or minus'],
  },
  'dividing-by-variable': {
    id: 'dividing-by-variable',
    title: msg('Never divide by the unknown'),
    short: msg('Dividing both sides by x throws away the solution x = 0.'),
    explain: [
      msg('Dividing both sides by something is only safe if that thing cannot be zero. An unknown might be.'),
      '$x^2 = 3x$ looks as if it simplifies to $x = 3$, but $x = 0$ also works in the original, and dividing by $x$ deleted it.',
      msg('Instead, bring everything to one side and factorise: $x^2 - 3x = 0$, so $x(x - 3) = 0$, so $x = 0$ or $x = 3$.'),
    ],
    trap: { wrong: 'x^2 = 3x  →  x = 3', right: 'x^2 = 3x  →  x = 0 or x = 3', note: msg('Check: 0² = 3·0 is true.') },
    example: {
      prompt: msg('Solve for x'),
      given: 'x^2 = 5x',
      steps: [
        { line: 'x^2 - 5x = 0', why: msg('Move everything to one side.') },
        { line: 'x(x - 5) = 0', why: msg('Take out the common factor x.') },
        { line: 'x = 0 or x = 5', why: msg('Each factor can be zero.') },
      ],
    },
    minutes: 3,
    keywords: [],
  },
  'inequality-flip': {
    id: 'inequality-flip',
    title: msg('When the inequality sign flips'),
    short: msg('Multiplying or dividing by a negative turns the inequality around.'),
    explain: [
      msg('Inequalities are solved exactly like equations, with one extra rule: multiplying or dividing both sides by a negative number reverses the sign.'),
      msg('Why: $2 < 5$ is true, but multiply both by −1 and you get −2 and −5, where −2 is the larger. The order flipped, so the sign must.'),
      msg('Adding or subtracting never flips it. Neither does dividing by a positive number.'),
    ],
    trap: { wrong: '-2x > 4  →  x > -2', right: '-2x > 4  →  x < -2', note: msg('Dividing by −2 flips > to <.') },
    example: {
      prompt: msg('Solve the inequality'),
      given: '7 - 3x <= 16',
      steps: [
        { line: '-3x <= 9', why: msg('Subtract 7 from both sides. No flip.') },
        { line: 'x >= -3', why: msg('Divide by −3, so the sign turns around.') },
      ],
    },
    minutes: 3,
    keywords: ['inequalit', 'greater than', 'less than'],
  },
  fractions: {
    id: 'fractions',
    title: msg('Adding and cancelling fractions'),
    short: msg('Add over a common denominator; cancel factors, never terms.'),
    explain: [
      msg('To add fractions they need the same denominator. Rewrite each one, then add the tops only: $1/2 + 1/3 = 3/6 + 2/6 = 5/6$.'),
      msg('Cancelling means dividing top and bottom by the same factor. It only works on things that are multiplied.'),
      msg('In $(x + 3)/3$ the 3 on top is added, not multiplied, so it cannot be cancelled. The denominator divides the whole top: $x/3 + 1$.'),
    ],
    trap: { wrong: '1/2 + 1/3  →  2/5', right: '1/2 + 1/3  →  5/6', note: msg('Tops and bottoms are not added separately.') },
    example: {
      prompt: msg('Work out'),
      given: '2/3 + 1/4',
      steps: [
        { line: '8/12 + 3/12', why: msg('The common denominator is 12.') },
        { line: '11/12', why: msg('Add the tops.') },
      ],
    },
    minutes: 3,
    keywords: ['fraction', 'rational expression', 'common denominator', 'cancel'],
  },
  'clearing-fractions': {
    id: 'clearing-fractions',
    title: msg('Clearing fractions from an equation'),
    short: msg('Multiply every term on both sides by the common denominator.'),
    explain: [
      msg('Fractions in an equation are easiest to remove at the start: multiply both sides by the lowest common denominator.'),
      msg('“Both sides” means every term, including the whole numbers that were not fractions. $x/3 + 2 = 5$ times 3 is $x + 6 = 15$.'),
      msg('After that it is an ordinary equation.'),
    ],
    trap: { wrong: 'x/3 + 2 = 5  →  x + 2 = 15', right: 'x/3 + 2 = 5  →  x + 6 = 15', note: msg('The 2 gets multiplied by 3 as well.') },
    example: {
      prompt: msg('Solve for x'),
      given: 'x/2 + x/3 = 10',
      steps: [
        { line: '3x + 2x = 60', why: msg('Multiply every term by 6.') },
        { line: '5x = 60', why: msg('Collect like terms.') },
        { line: 'x = 12', why: msg('Divide both sides by 5.') },
      ],
    },
    minutes: 3,
    keywords: ['equations with fraction', 'fractional equation', 'clearing'],
  },
  'order-of-operations': {
    id: 'order-of-operations',
    title: msg('Order of operations'),
    short: msg('Brackets, then powers, then × and ÷, then + and −.'),
    explain: [
      msg('Calculations are not done left to right. The order is: brackets, powers, multiplication and division, then addition and subtraction.'),
      msg('So $2 + 3 * 4$ is $2 + 12 = 14$, not 20. And $-3^2$ is $-9$, because the power comes before the minus; to square a negative number, bracket it: $(-3)^2 = 9$.'),
      msg('When substituting a negative value, always put it in brackets.'),
    ],
    trap: { wrong: '2 + 3 * 4  →  20', right: '2 + 3 * 4  →  14', note: msg('Multiply before adding.') },
    example: {
      prompt: msg('Work out'),
      given: '20 - 2 * 3^2',
      steps: [
        { line: '20 - 2 * 9', why: msg('Powers first.') },
        { line: '20 - 18', why: msg('Then multiplication.') },
        { line: '2', why: msg('Then subtraction.') },
      ],
    },
    minutes: 2,
    keywords: ['order of operation', 'bodmas', 'bidmas', 'pemdas', 'substitut', 'evaluat'],
  },
  'quadratic-formula': {
    id: 'quadratic-formula',
    title: msg('The quadratic formula'),
    short: msg('When it will not factorise: x = (−b ± √(b² − 4ac)) / 2a.'),
    explain: [
      msg('Every quadratic $ax^2 + bx + c = 0$ can be solved with $x = (-b ± sqrt(b^2 - 4ac))/(2a)$, whether or not it factorises.'),
      msg('Get the equation equal to zero first, then read off a, b and c with their signs. Most errors are a lost minus sign on b or c.'),
      msg('The part under the root tells you what to expect: positive gives two solutions, zero gives one, negative gives none.'),
    ],
    example: {
      prompt: msg('Solve for x'),
      given: 'x^2 + 4x + 1 = 0',
      steps: [
        { line: 'x = (-4 ± sqrt(12))/2', why: 'a = 1, b = 4, c = 1, so b² − 4ac = 16 − 4 = 12.' },
        { line: 'x = -2 ± sqrt(3)', why: '√12 = 2√3, then divide through by 2.' },
      ],
    },
    minutes: 4,
    keywords: ['quadratic formula', 'discriminant', 'completing the square'],
  },
  systems: {
    id: 'systems',
    title: msg('Simultaneous equations'),
    short: msg('Eliminate one letter, solve for the other, substitute back.'),
    explain: [
      msg('Two equations with two unknowns are solved by getting rid of one unknown. Either add or subtract the equations so a letter cancels, or rearrange one and substitute it into the other.'),
      msg('Once one letter is found, put it back into either original equation to find the second.'),
      msg('Always check the pair in both equations, it takes ten seconds and catches almost every slip.'),
    ],
    example: {
      prompt: msg('Solve the system'),
      given: 'x + y = 7, x - y = 3',
      steps: [
        { line: '2x = 10', why: msg('Add the equations: the y’s cancel.') },
        { line: 'x = 5', why: msg('Divide by 2.') },
        { line: 'x = 5, y = 2', why: msg('Substitute x = 5 into x + y = 7.') },
      ],
    },
    minutes: 4,
    keywords: ['simultaneous', 'system of', 'elimination', 'substitution method'],
  },
  'simplest-form': {
    id: 'simplest-form',
    title: msg('Finishing an answer'),
    short: msg('An answer is finished when nothing more can be combined or cancelled.'),
    explain: [
      'A correct line is not always a finished one. $x = 15/3$ is true, but the answer is $x = 5$.',
      msg('Before you stop, check: are there like terms left to collect, a fraction that cancels, or brackets still to multiply out?'),
    ],
    example: {
      prompt: msg('Write in simplest form'),
      given: '12/18',
      steps: [{ line: '2/3', why: msg('Divide top and bottom by 6.') }],
    },
    minutes: 1,
    keywords: ['simplest form', 'lowest terms'],
  },
};

export const CONCEPTS = { ...ALGEBRA_CONCEPTS, ...CALC_CONCEPTS } as Record<ConceptId, Concept>;

/** One idea, in the app's language. `CONCEPTS` itself stays in English: it is what the notes are matched against. */
export const conceptOf = (id: ConceptId): Concept => localized(CONCEPTS[id]);

export function conceptsForText(text: string): ConceptId[] {
  const t = text.toLowerCase();
  const out: ConceptId[] = [];
  for (const c of Object.values(CONCEPTS)) {
    if (c.keywords.some((k) => t.includes(k))) out.push(c.id);
  }
  return out;
}
