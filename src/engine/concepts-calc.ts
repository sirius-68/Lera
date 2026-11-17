import type { Concept } from './concepts';
import { ConceptId, Subject } from './types';
import { msg } from '../i18n';

type CalcId = 'limits' | 'power-rule' | 'product-rule' | 'quotient-rule' | 'chain-rule' | 'trig-derivatives' | 'exp-log-derivatives' | 'antiderivatives' | 'constant-of-integration' | 'u-substitution' | 'integration-by-parts' | 'definite-integrals';

/** Calculus 1 and 2: the same three-minute reviews as algebra, written to be read by someone meeting the idea cold. */
export const CALC_CONCEPTS: Record<CalcId, Concept> = {
  limits: {
    id: 'limits',
    title: msg('Limits'),
    short: 'A limit is the value an expression heads towards, not necessarily the value it has.',
    explain: [
      'A limit asks one question: as x gets closer and closer to some number, what does the expression get closer to? You are watching where it is *heading*, not where it lands.',
      msg('Step one is always the same: put the number in. If you get a normal answer, that’s the limit and you are done.'),
      msg('If you get 0/0, don’t panic and don’t write 0. It means the top and the bottom share a hidden factor. Factor both, cancel it, and substitute again.'),
      msg('For x → ∞ in a fraction, only the biggest power on top and the biggest power underneath matter. Compare just those two terms.'),
    ],
    trap: { wrong: 'lim x->2 (x^2-4)/(x-2) → 0', right: 'lim x->2 (x^2-4)/(x-2) → 4', note: '0/0 is not an answer. Cancel (x − 2) first: what is left is x + 2.' },
    example: {
      prompt: msg('Find the limit'),
      given: 'lim x→3 (x^2-9)/(x-3)',
      steps: [
        { line: 'lim x→3 (x + 3)', why: msg('Putting 3 in gives 0/0, so factor: x² − 9 = (x − 3)(x + 3). The (x − 3) cancels.') },
        { line: '6', why: msg('Now nothing breaks, so substitute x = 3.') },
      ],
    },
    minutes: 3,
    keywords: ['limit', 'lim ', 'approaches', 'tends to', 'continuity', 'continuous', 'l’hôpital', "l'hopital", 'indeterminate', 'предел'],
  },
  'power-rule': {
    id: 'power-rule',
    title: msg('The power rule'),
    short: msg('Bring the power down in front, then make the power one smaller.'),
    explain: [
      'A derivative tells you how fast something is changing, the steepness of its graph at each point.',
      msg('For any power of x there are exactly two moves: **bring the power down in front** as a multiplier, then **make the power one smaller**. So $x^3$ becomes $3x^2$.'),
      'A number multiplying the term just stays and multiplies: $5x^3$ becomes $15x^2$. A number on its own never changes, so its derivative is 0 and it vanishes.',
      msg('Roots and fractions are powers in disguise: $sqrt(x)$ is $x^(1/2)$ and $1/x^2$ is $x^(-2)$. Rewrite first, then use the same two moves.'),
    ],
    trap: { wrong: 'd/dx(x^3) → 3x^3', right: 'd/dx(x^3) → 3x^2', note: msg('The power came down but wasn’t lowered. Both moves, every time.') },
    example: {
      prompt: msg('Differentiate'),
      given: 'd/dx(4x^3 - 2x + 7)',
      steps: [{ line: '12x^2 - 2', why: '4x³: bring down the 3 (4 × 3 = 12), lower the power to 2. −2x becomes −2. The 7 is a plain number, so it becomes 0.' }],
    },
    minutes: 3,
    keywords: ['derivative', 'differentiat', msg('power rule'), 'rate of change', 'gradient function', 'slope of the tangent', 'производн'],
  },
  'product-rule': {
    id: 'product-rule',
    title: msg('The product rule'),
    short: msg('For two things multiplied: (first)′ × second + first × (second)′.'),
    explain: [
      msg('When two x-things are **multiplied**, you can’t just differentiate each and multiply the answers. It feels like it should work. It doesn’t.'),
      msg('Instead each part takes a turn: differentiate the first and keep the second, **plus** keep the first and differentiate the second.'),
      msg('Say it as a chant: “first-dash times second, plus first times second-dash.”'),
    ],
    trap: { wrong: 'd/dx(x^2 sin(x)) → 2x cos(x)', right: 'd/dx(x^2 sin(x)) → 2x sin(x) + x^2 cos(x)', note: msg('Differentiating both parts and multiplying loses a whole term.') },
    example: {
      prompt: msg('Differentiate'),
      given: 'd/dx(x^3 e^x)',
      steps: [
        { line: 'd/dx(x^3) e^x + x^3 d/dx(e^x)', why: msg('Two things multiplied, so set up the product rule before working anything out.') },
        { line: '3x^2 e^x + x^3 e^x', why: 'x³ becomes 3x². eˣ stays eˣ.' },
      ],
    },
    minutes: 3,
    keywords: [msg('product rule'), 'derivative of a product'],
  },
  'quotient-rule': {
    id: 'quotient-rule',
    title: msg('The quotient rule'),
    short: msg('For a fraction: (top′ × bottom − top × bottom′) ÷ bottom².'),
    explain: [
      msg('When one x-thing is **divided** by another, use the quotient rule.'),
      msg('On top: (derivative of the top × the bottom) **minus** (the top × derivative of the bottom). Underneath: the bottom, squared.'),
      msg('The order matters because of the minus. Always start with the derivative of the **top**.'),
    ],
    trap: { wrong: 'd/dx(x/(x+1)) → 1/1', right: 'd/dx(x/(x+1)) → 1/(x+1)^2', note: msg('Differentiating top and bottom separately is not the quotient rule.') },
    example: {
      prompt: msg('Differentiate'),
      given: 'd/dx((2x+1)/(x-3))',
      steps: [
        { line: '(2(x-3) - (2x+1))/(x-3)^2', why: msg('Top′ = 2, bottom′ = 1. So: 2 × (x − 3) minus (2x + 1) × 1, all over (x − 3)².') },
        { line: '-7/(x-3)^2', why: '2x − 6 − 2x − 1 = −7.' },
      ],
    },
    minutes: 3,
    keywords: [msg('quotient rule'), 'derivative of a quotient'],
  },
  'chain-rule': {
    id: 'chain-rule',
    title: msg('The chain rule'),
    short: msg('Differentiate the outside, leave the inside alone, then multiply by the derivative of the inside.'),
    explain: [
      msg('Sometimes a function is wrapped around another one, like $sin(3x)$ or $(x^2+1)^5$. There is an **outside** and an **inside**.'),
      msg('Two moves: differentiate the outside while treating the inside as a single block you don’t touch, then **multiply by the derivative of that block**.'),
      msg('How to spot it: if what is inside the brackets is anything more than plain x, you need the chain rule.'),
    ],
    trap: { wrong: 'd/dx(sin(3x)) → cos(3x)', right: 'd/dx(sin(3x)) → 3cos(3x)', note: msg('The outside was done; the inside (3x, whose derivative is 3) was forgotten.') },
    example: {
      prompt: msg('Differentiate'),
      given: 'd/dx((x^2+1)^4)',
      steps: [
        { line: '4(x^2+1)^3 d/dx(x^2+1)', why: msg('Outside: something to the 4th → 4 × (something)³. The block x² + 1 stays as it is. Then multiply by the block’s derivative.') },
        { line: '8x(x^2+1)^3', why: msg('The derivative of x² + 1 is 2x, and 4 × 2x = 8x.') },
      ],
    },
    minutes: 4,
    keywords: [msg('chain rule'), 'composite function', 'function of a function', 'implicit'],
  },
  'trig-derivatives': {
    id: 'trig-derivatives',
    title: msg('Derivatives of sin, cos and tan'),
    short: 'sin → cos, cos → −sin, tan → sec². Only cos picks up a minus.',
    explain: [
      msg('Three facts to know by heart: the derivative of $sin(x)$ is $cos(x)$. The derivative of $cos(x)$ is $-sin(x)$. The derivative of $tan(x)$ is $sec(x)^2$.'),
      msg('The one that catches people is the minus sign. A way to remember: the functions that start with **co** (cos, cot, csc) give a negative derivative.'),
      msg('If the inside is more than plain x, the chain rule applies on top.'),
    ],
    trap: { wrong: 'd/dx(cos(x)) → sin(x)', right: 'd/dx(cos(x)) → -sin(x)', note: 'cos goes downhill at the start, so its derivative is negative.' },
    example: {
      prompt: msg('Differentiate'),
      given: 'd/dx(3sin(x) - 2cos(x))',
      steps: [{ line: '3cos(x) + 2sin(x)', why: 'sin → cos. cos → −sin, and minus a minus makes a plus.' }],
    },
    minutes: 2,
    keywords: ['derivative of sin', 'derivative of cos', 'trigonometric derivative', 'derivatives of trig'],
  },
  'exp-log-derivatives': {
    id: 'exp-log-derivatives',
    title: msg('Derivatives of eˣ and ln x'),
    short: 'eˣ is its own derivative; ln x becomes 1/x.',
    explain: [
      '$e^x$ is the one function that is its own derivative: differentiate it and you get $e^x$ straight back.',
      msg('The derivative of $ln(x)$ is $1/x$.'),
      msg('Careful: the power rule is for x **underneath** a number power, like $x^3$. When x is **in the power**, like $e^x$, the power rule does not apply.'),
      msg('With something more than x in the power or inside the log, add the chain rule: $e^(3x)$ becomes $3e^(3x)$.'),
    ],
    trap: { wrong: 'd/dx(e^(2x)) → 2x e^(2x-1)', right: 'd/dx(e^(2x)) → 2e^(2x)', note: msg('That was the power rule, used on the wrong kind of function.') },
    example: {
      prompt: msg('Differentiate'),
      given: 'd/dx(e^(5x) + ln(x))',
      steps: [{ line: '5e^(5x) + 1/x', why: 'e^(5x) stays e^(5x), times the derivative of 5x, which is 5. ln x becomes 1/x.' }],
    },
    minutes: 3,
    keywords: ['exponential function', 'natural log', 'derivative of e', 'derivative of ln', 'logarithmic differentiation'],
  },
  antiderivatives: {
    id: 'antiderivatives',
    title: msg('Integrating powers and the standard table'),
    short: msg('Add 1 to the power, then divide by the new power.'),
    explain: [
      msg('Integrating is differentiating **backwards**. You are asked: “what could I differentiate to get this?”'),
      msg('For a power of x, undo the power rule: **add 1 to the power, then divide by the new power**. So $x^2$ becomes $x^3/3$.'),
      msg('The table runs backwards too: ∫cos = sin, ∫sin = −cos, ∫eˣ = eˣ, and ∫1/x = ln|x| (the one power the rule can’t handle).'),
      'A check that never fails: differentiate your answer. You must get back exactly what was inside the integral.',
    ],
    trap: { wrong: '∫ x^2 dx → x^3 + C', right: '∫ x^2 dx → x^3/3 + C', note: msg('The power went up but nothing was divided. Differentiate x³ and you get 3x², not x².') },
    example: {
      prompt: msg('Integrate'),
      given: '∫ (6x^2 + 4x) dx',
      steps: [{ line: '2x^3 + 2x^2 + C', why: '6x² → 6x³/3 = 2x³. 4x → 4x²/2 = 2x². Then + C.' }],
    },
    minutes: 3,
    keywords: ['integral', 'integrat', 'antiderivative', 'indefinite', 'primitive', 'интеграл'],
  },
  'constant-of-integration': {
    id: 'constant-of-integration',
    title: msg('The + C'),
    short: msg('Every integral without limits ends in + C.'),
    explain: [
      msg('Differentiate $x^2$ and you get $2x$. Differentiate $x^2 + 5$ and you also get $2x$. And $x^2 - 100$. The plain number always disappears.'),
      msg('So going backwards from $2x$ you can’t know which number was there. **+ C** is how you say “plus some number I can’t recover”.'),
      msg('Rule of thumb: no limits on the integral sign → write + C. Limits on the sign → no C (it cancels itself out).'),
    ],
    trap: { wrong: '∫ 2x dx → x^2', right: '∫ 2x dx → x^2 + C', note: msg('Right function, unfinished answer.') },
    example: {
      prompt: msg('Integrate'),
      given: '∫ 3x^2 dx',
      steps: [{ line: 'x^3 + C', why: msg('Add 1 to the power (3), divide by it (3 ÷ 3 = 1), and finish with + C.') }],
    },
    minutes: 1,
    keywords: ['constant of integration', 'arbitrary constant', '+ c'],
  },
  'u-substitution': {
    id: 'u-substitution',
    title: msg('Substitution (u-sub)'),
    short: msg('The chain rule in reverse: name the inside u, and its derivative should already be there.'),
    explain: [
      msg('Substitution undoes the chain rule. Look for an **inside**, and for the inside’s derivative sitting next to it (maybe missing just a number).'),
      msg('Call the inside u. Then “derivative of the inside × dx” becomes du, and the whole integral turns into a simple one in u.'),
      msg('Integrate in u, then put the inside back where u was.'),
      msg('Quick version when the inside is a straight line like 3x + 2: integrate as normal and **divide by the number in front of x**.'),
    ],
    trap: { wrong: '∫ cos(3x) dx → sin(3x) + C', right: '∫ cos(3x) dx → sin(3x)/3 + C', note: msg('Differentiate sin(3x) and the chain rule hands you an extra 3. Dividing by 3 cancels it.') },
    example: {
      prompt: msg('Integrate'),
      given: '∫ 2x(x^2+1)^3 dx',
      steps: [{ line: '(x^2+1)^4/4 + C', why: msg('Let u = x² + 1. Its derivative, 2x, is right there, so this is ∫u³ du = u⁴/4. Put x² + 1 back for u.') }],
    },
    minutes: 4,
    keywords: ['substitution', 'u-sub', 'change of variable', 'reverse chain'],
  },
  'integration-by-parts': {
    id: 'integration-by-parts',
    title: msg('Integration by parts'),
    short: '∫u dv = uv − ∫v du, the product rule in reverse.',
    explain: [
      msg('Use this for a product that substitution can’t untangle, such as $x e^x$ or $x cos(x)$.'),
      msg('Split the product in two. Call one part u (you will differentiate it) and the other dv (you will integrate it). Then: **∫u dv = uv − ∫v du**.'),
      msg('Choosing u: pick the part that gets *simpler* when differentiated. A handy order is logs first, then powers of x, then trig and exponentials last.'),
    ],
    trap: { wrong: '∫ x e^x dx → x^2 e^x/2 + C', right: '∫ x e^x dx → x e^x - e^x + C', note: msg('You can’t integrate each part of a product separately, just as you can’t differentiate each part separately.') },
    example: {
      prompt: msg('Integrate'),
      given: '∫ x cos(x) dx',
      steps: [{ line: 'x sin(x) + cos(x) + C', why: 'u = x (becomes 1), dv = cos x dx (v = sin x). So x·sin x − ∫sin x dx = x sin x + cos x.' }],
    },
    minutes: 4,
    keywords: ['by parts', 'integration by parts'],
  },
  'definite-integrals': {
    id: 'definite-integrals',
    title: msg('Definite integrals'),
    short: msg('Antiderivative first, then (value at the top) − (value at the bottom).'),
    explain: [
      'A definite integral has numbers on the integral sign. Its answer is a **number**, the area between the curve and the x-axis from one limit to the other.',
      msg('Two stages. First find the antiderivative, exactly as usual (skip the + C).'),
      msg('Second: put the **top** limit in, put the **bottom** limit in, and subtract: top minus bottom. Always in that order.'),
    ],
    trap: { wrong: '∫[1,3] 2x dx → 9', right: '∫[1,3] 2x dx → 8', note: 'x² at 3 is 9, but you must still subtract x² at 1.' },
    example: {
      prompt: msg('Evaluate'),
      given: '∫[0,2] 3x^2 dx',
      steps: [
        { line: 'x^3', why: msg('The antiderivative of 3x² is x³.') },
        { line: '8 - 0', why: msg('Top limit: 2³ = 8. Bottom limit: 0³ = 0. Top minus bottom.') },
        { line: '8', why: msg('That’s the area under the curve from 0 to 2.') },
      ],
    },
    minutes: 3,
    keywords: ['definite integral', 'area under', 'fundamental theorem', 'evaluate the integral', 'improper integral'],
  },
};

export const SUBJECT_OF: Partial<Record<ConceptId, Subject>> = {
  limits: 'calc1',
  'power-rule': 'calc1',
  'product-rule': 'calc1',
  'quotient-rule': 'calc1',
  'chain-rule': 'calc1',
  'trig-derivatives': 'calc1',
  'exp-log-derivatives': 'calc1',
  antiderivatives: 'calc2',
  'constant-of-integration': 'calc2',
  'u-substitution': 'calc2',
  'integration-by-parts': 'calc2',
  'definite-integrals': 'calc2',
};

export const subjectOf = (id: ConceptId): Subject => SUBJECT_OF[id] ?? 'algebra';

export const SUBJECT_LABEL: Record<Subject, string> = { algebra: msg('Algebra'), calc1: msg('Calculus 1'), calc2: msg('Calculus 2') };

/** What each idea leans on. When a gap shows up, the trouble often starts one step earlier. */
export const PREREQS: Partial<Record<ConceptId, ConceptId[]>> = {
  balance: ['inverse-operations'],
  distributive: ['signed-arithmetic'],
  'like-terms': ['signed-arithmetic'],
  'expanding-binomials': ['distributive', 'like-terms'],
  factoring: ['expanding-binomials'],
  'zero-product': ['factoring'],
  'quadratic-formula': ['order-of-operations', 'signed-arithmetic'],
  'clearing-fractions': ['fractions', 'distributive'],
  'inequality-flip': ['inverse-operations'],
  systems: ['inverse-operations', 'like-terms'],
  'exponent-rules': ['arithmetic'],
  limits: ['factoring', 'fractions'],
  'power-rule': ['exponent-rules'],
  'product-rule': ['power-rule'],
  'quotient-rule': ['power-rule', 'product-rule'],
  'chain-rule': ['power-rule'],
  'trig-derivatives': ['power-rule'],
  'exp-log-derivatives': ['power-rule', 'chain-rule'],
  antiderivatives: ['power-rule'],
  'constant-of-integration': ['antiderivatives'],
  'u-substitution': ['chain-rule', 'antiderivatives'],
  'integration-by-parts': ['product-rule', 'antiderivatives'],
  'definite-integrals': ['antiderivatives', 'arithmetic'],
};

/**
 * Every idea once more, the way you'd say it to someone who has never met it:
 * no symbols, one everyday picture. Shown when a student says an explanation didn't land.
 */
export const PLAIN: Record<ConceptId, string> = {
  'inverse-operations': msg('Think of the equals sign as the middle of a see-saw. To move something off one side, you take the same thing off both sides, which makes it look like it hopped across and flipped: a plus turns into a minus, a minus into a plus.'),
  balance: msg('If you cut a pizza order in half, you halve every pizza on the order, not just the first one. Dividing an equation works the same way: every single term gets divided.'),
  distributive: 'A number outside a bracket is like handing out sweets to everyone in a room. Everyone inside the bracket gets one, not just the person nearest the door.',
  'like-terms': msg('You can add 3 apples and 5 apples to get 8 apples. You can’t add 3 apples and 5 bananas into one pile. x’s go with x’s, x²’s with x²’s, plain numbers with plain numbers.'),
  'signed-arithmetic': msg('Picture a thermometer. Adding a negative means going down. Taking away a negative means removing some cold, so you go up. Two minus signs next to each other make a plus.'),
  arithmetic: msg('The method was right; a number was miscounted. Slow down on the sums, say each one in your head before writing it.'),
  'exponent-rules': 'A power is just a count of how many times something is multiplied. x² times x³ is two x’s then three more, five x’s in a row. So when you multiply, you add the counts.',
  'expanding-binomials': msg('Two brackets multiplied is like two couples shaking hands: everyone in the first bracket must shake hands with everyone in the second. That’s four handshakes, not two.'),
  factoring: msg('Factorising is expanding played backwards, you are un-multiplying. Ask: which two brackets would multiply out to give this? Find two numbers that multiply to the last number and add to the middle one.'),
  'zero-product': msg('If two numbers multiply to make zero, one of them must already be zero, there’s no other way to get zero by multiplying. So set each bracket to zero, one at a time.'),
  'square-root-pm': msg('Both 3 × 3 and (−3) × (−3) give 9. So when you undo a square, there are two possible numbers it could have been, the positive one and the negative one. Write both.'),
  'dividing-by-variable': msg('Dividing both sides by x quietly throws away the possibility that x is 0. Instead, bring everything to one side and take x out as a factor, then you keep every answer.'),
  'inequality-flip': msg('If 2 is less than 5, then −2 is *greater* than −5. Multiplying or dividing by a negative turns the number line around, so the arrow has to turn around too.'),
  fractions: msg('To add slices of pizza they have to be the same size slice. Make the bottoms match first; only then add the tops. The bottom never gets added.'),
  'clearing-fractions': msg('Fractions are awkward, so get rid of them: multiply *everything* in the equation by a number all the bottoms go into. Every term, including the ones that weren’t fractions.'),
  'order-of-operations': msg('Maths has a fixed queue: brackets first, then powers, then multiplying and dividing, then adding and subtracting. Skipping the queue changes the answer.'),
  'quadratic-formula': msg('When a quadratic won’t split into neat brackets, the formula is a machine that always works: read off a, b and c, drop them in carefully (brackets around negatives!), and turn the handle.'),
  systems: msg('Two equations, two unknowns: line them up and add or subtract so that one letter cancels out. Solve for the letter that’s left, then go back for the other.'),
  'simplest-form': 'A correct answer that isn’t tidied up is like a sentence without its full stop. Check there’s nothing left to combine, cancel or multiply out.',
  limits: msg('Imagine walking towards a door. A limit asks where you are *heading*, even if the door turns out to be locked when you arrive. Getting 0/0 just means the door is locked: find another way to see where the path was going (cancel the common factor).'),
  'power-rule': msg('Two moves, always the same: the little number on top jumps down to the front, and then the little number on top goes down by one. x³ → 3x². That’s the whole rule.'),
  'product-rule': msg('Two friends are multiplied together. Each takes a turn: first one changes while the other waits, then they swap. Add the two turns together.'),
  'quotient-rule': msg('For a fraction, remember the chant “low d-high minus high d-low, over low squared”: bottom × (top’s derivative) minus top × (bottom’s derivative), all over the bottom squared.'),
  'chain-rule': msg('Think of a present inside wrapping paper. Deal with the wrapping first (the outside), leaving the present untouched, then deal with the present (multiply by the inside’s derivative). Outside first, then inside.'),
  'trig-derivatives': msg('Three facts to memorise like phone numbers: sin turns into cos. cos turns into minus sin. tan turns into sec squared. The only minus belongs to cos.'),
  'exp-log-derivatives': 'eˣ is the copycat function: its derivative is itself. ln x turns into 1 over x. And if x sits *up in the power*, the power rule is the wrong tool.',
  antiderivatives: msg('Integrating is rewinding a film of differentiating. Differentiating made the power go down by one and multiplied, so rewinding makes the power go up by one and divides.'),
  'constant-of-integration': msg('When you differentiate, any plain number vanishes. So rewinding, you can’t know what number was there. “+ C” is you being honest about that missing number.'),
  'u-substitution': msg('Spot a lump inside the problem and give it a nickname, u. If the lump’s derivative is also sitting there, the scary integral becomes an easy one about u. Solve the easy one, then swap the nickname back.'),
  'integration-by-parts': msg('For a product you can’t untangle: let one part get simpler (differentiate it) while you integrate the other. First part × integrated second part, minus a new, easier integral.'),
  'definite-integrals': msg('It’s measuring area. Find the antiderivative, then: (its value at the end) minus (its value at the start), like reading a car’s mileage at the end of a trip and subtracting the reading from the start.'),
};
