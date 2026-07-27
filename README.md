# PhD Escape Visuals

> My dissertation defense is this year. Instead of writing it, I'm building interactive visualizations that absolutely nobody asked for. Every visualization here represents roughly 4-6 hours of *not* writing Chapter 3. Enjoy.

![Sampling & Aliasing Disco](assets/sampling-aliasing-disco.png)

<sub>Above: the *reverse* scenario — the wheel appears to spin backwards, and the amber
curve is the sinc reconstruction of the blue signal's own samples.</sub>

## Visualizations

Each visualization is a single **genuinely self-contained** HTML file: the KaTeX
stylesheet and the woff2 fonts its formulas need are embedded as data URIs, the
formulas are pre-rendered at build time, and the UI uses system fonts. No CDN, no
build tools, no `node_modules` heavier than the dissertation itself — open the
file in a browser, with or without a network connection.

All visualizations support **EN / RU / TT** language switching.

### Signals & Systems

| Visualization | What you'll learn (instead of finishing your thesis) | File |
|---|---|---|
| **Sampling & Aliasing Disco** | Nyquist theorem, aliasing, sinc reconstruction, the stroboscopic effect | [Open](Signals%20%26%20Systems/sampling-aliasing-disco.html) |
| **Convolution Roller** | Convolution integral, flip-and-shift, LTI systems, impulse response | [Open](Signals%20%26%20Systems/convolution-roller.html) |

![Convolution Roller](assets/convolution-roller.png)

The sampling demo reconstructs the signal from its own samples with a windowed
sinc kernel rather than asserting an alias formula, so below the Nyquist
frequency you watch the reconstruction land on the original — and above it, the
same dots produce a slower wave. Components sitting inside the reconstruction
filter's guard band are dimmed and labelled instead of being drawn as if a
finite filter could resolve them.

### Probability & Statistics

| Visualization | What you'll learn (instead of finishing your thesis) | File |
|---|---|---|
| **π Coin Estimator** | Monte Carlo estimation of π via random walks and stopping times | [Open](Probability%20%26%20Statistics/pi-coin-estimator.html) |

![π Coin Estimator](assets/pi-coin-estimator.png)

The stopping time here has **infinite expectation** (`P(τ > n) ~ √(2/πn)`), so
trials are driven incrementally under a per-frame budget — 1000 trials really do
cost about 700 000 coin tosses, and the demo shows you the count. Displayed
digits are derived from the standard error, so it never claims precision it
does not have.

### Natural Language Processing

| Visualization | What you'll learn (instead of finishing your thesis) | File |
|---|---|---|
| **Tokenizer Zoo** | BPE, WordPiece, Unigram & byte-level BPE, trained step-by-step | [Open](Natural%20Language%20Processing/tokenizer-zoo.html) |

![Tokenizer Zoo](assets/tokenizer-zoo.png)

All four tokenizers get the **same vocabulary budget**, both BPE variants carry a
word-boundary marker (`</w>`, `Ġ`), and any tokenizer that emits `[UNK]` is
excluded from the efficiency ranking — one `[UNK]` is not efficiency, it is a
lost input. The Unigram panel uses a real k-best Viterbi.

## How to use

1. Clone the repo
2. Open any `.html` file in a modern browser
3. Play with the sliders, or pick one of the guided scenarios
4. Feel productive while learning nothing new for your defense

Keyboard: `Space` plays/pauses where applicable, `←`/`→` step, `Home`/`End` jump
to the ends. `F` replays the flip in the convolution demo; `T` / `R` toss and run
in the π demo.

## Development

The demos are hand-written HTML. The one generated part is the embedded KaTeX
output: a build step renders every formula to static markup and inlines the
stylesheet together with the woff2 subset those formulas need, so the shipped
file has no external references.

A dependency-free Node test suite lives alongside the project (currently in the
untracked `tmp/` working directory — promote it to `tests/` if you want it in
version control). It covers the numerical claims (sinc reconstruction vs. the
signed alias, convolution quadrature, k-best Viterbi vs. brute force, the
`n^(-1/2)` convergence law), i18n completeness, self-containment, WCAG contrast,
and the absence of stray control characters. Its harness extracts the real
inline `<script>` from each demo and runs it under a DOM stub, so the tests
exercise the shipped code rather than a copy.

## Contributing

If you too are avoiding your thesis, PRs are welcome. Bonus points if you submit
one during working hours. Please keep the demos dependency-free.

## License

MIT — see [LICENSE](LICENSE). Bundled KaTeX is MIT, © Khan Academy.
