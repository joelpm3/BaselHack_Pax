"""
Builds the PDF fonts in src/fonts/pdf from the app's Pax Civil WOFF2 files: a Latin subset as
plain TrueType without layout tables, which pdf-lib embeds reliably (it cannot read WOFF2 and
mis-subsets the full font). Pax Civil allows embedding (OS/2 fsType 8).

Run from code/:  uvx --from fonttools --with brotli python scripts/subset-pdf-fonts.py
"""

from fontTools import subset
from fontTools.ttLib import TTFont

UNICODES = (
    "U+0020-007E,U+00A0-017F,U+0218-021B,U+2010-2027,U+2030-203A,U+20AC,U+2122,U+2190-2193,"
    "U+2212,U+2264,U+2265,U+25A0,U+25AA,U+2713"
)

for weight in ["Regular", "Medium", "Bold"]:
    font = TTFont(f"src/fonts/PaxCivil-{weight}.woff2")
    options = subset.Options()
    options.layout_features = []
    options.drop_tables += ["GSUB", "GPOS", "GDEF"]
    options.hinting = False
    options.name_IDs = ["*"]
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=subset.parse_unicodes(UNICODES))
    subsetter.subset(font)
    font.flavor = None
    font.save(f"src/fonts/pdf/PaxCivil-{weight}.ttf")
