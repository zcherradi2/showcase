# Zakariae Cherradi - selected work

AI / ML engineer in Tangier, Morocco. Three years building ML inside .NET and Angular systems
at FoliaTech, plus the projects below, which I build and measure on my own time.

**Portfolio:** https://zcherradi2.github.io

## Projects

| Project | What it does | Stack |
|---|---|---|
| **Computah** | A Windows desktop assistant. One hotkey captures what is on screen; an LLM agent reads it and can answer, point at a control, open a file at an exact line, or drive the mouse and keyboard. 13,100 lines, 141 automated tests, and a safety layer that risk-scores every shell command before it runs. | C#, .NET 10, WPF |
| **Invoice extraction** | OCR plus LLM pipeline that pulls header fields and line items out of French construction invoices. A line-detection classifier trained on 203 annotated documents decides where an LLM is actually needed, cutting LLM calls per document by about 65%. Measured at 0.885 field-weighted accuracy on held-out documents. Totals are re-derived from the lines, and an invoice that does not add up is flagged instead of accepted. | Python, scikit-learn, OCR, LLM |
| **Real-estate platform** | Property listing API and an agent dashboard on top of it. | .NET, Angular |
| **Trading policy tool** | Encodes trading rules as testable policy, so a strategy can be checked against them rather than only described. | Python |
| **headlessAgent** | A floating chat window whose browser is invisible: a real Chrome driven over the DevTools protocol, a frameless always-on-top popup in front of it. A study in browser automation. | Python, Playwright, Tk |
| **Barcode printing** | Label and barcode generation for warehouse stock, printed to the hardware that is actually on site. | .NET |

## Code and writing

- Portfolio: https://zcherradi2.github.io
- The invoice work, measured on two documents: https://zcherradi2.github.io/case-study.html
- All projects in detail: https://zcherradi2.github.io/projects.html
- GitHub profile and public repos: https://github.com/zcherradi2
- headlessAgent: https://github.com/zcherradi2/headlessAgent

## Working with me

Fixed-scope work, priced before it starts: https://zcherradi2.github.io/services.html

## Licence

Not chosen yet - treat it as all rights reserved until a `LICENSE` file appears here.
