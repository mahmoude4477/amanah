"""Build a verse index from unmodified Tanzil Quran XML files."""

import json
import pathlib
import re
import xml.etree.ElementTree as ET


ROOT = pathlib.Path(__file__).resolve().parents[1]
VENDOR = ROOT / "vendor"
VERSION = "1.1"
LICENSE = "Creative Commons Attribution 3.0"
TEXT_TYPES = {
    "simple": {
        "file": "vendor/quran-simple-clean.xml",
        "title": "Simple Clean",
        "narration": "Hafs an Asim",
        "use": "Undiacritized text without pause marks. Used for analysis and for exact matching of text submitted without diacritics.",
    },
    "uthmani": {
        "file": "vendor/quran-uthmani.xml",
        "title": "Uthmani",
        "narration": "Hafs an Asim",
        "use": "Uthmani script with full diacritics. Used for display, for exact matching of text submitted with diacritics, and as source_ar for the AMANAH ML model.",
    },
}


def read_header(filename: str, title: str) -> dict[str, str]:
    header = (VENDOR / filename).read_text(encoding="utf-8").split("-->", 1)[0]
    name = re.search(r"#\s+(Tanzil Quran Text \(([^,]+), Version ([^)]+)\))", header)
    copyright_line = re.search(r"#\s+(Copyright \(C\) [0-9-]+ Tanzil Project)", header)
    license_line = re.search(r"#\s+License: (.+?)\s*$", header, re.MULTILINE)
    assert name and copyright_line and license_line, filename
    assert name.group(2) == title and name.group(3) == VERSION, name.group(1)
    assert license_line.group(1) == LICENSE, license_line.group(1)
    assert "CHANGING IT IS NOT ALLOWED" in header
    return {"name": name.group(1), "copyright": copyright_line.group(1), "notice": read_notice(header)}


def read_notice(header: str) -> str:
    """The complete Tanzil copyright block, line for line, with only the leading "# " comment markers removed."""
    lines = [line.rstrip() for line in header.split("<!--", 1)[1].splitlines() if line.strip()]
    assert all(line.startswith("#") for line in lines), "unexpected line in the Tanzil copyright block"
    notice = "\n".join(line[2:] if line.startswith("# ") else line[1:] for line in lines)
    assert "This copyright notice shall be included in all verbatim copies" in notice
    return notice


def read_suras(filename: str) -> list[ET.Element]:
    suras = ET.parse(VENDOR / filename).getroot().findall("sura")
    assert len(suras) == 114
    assert sum(len(sura.findall("aya")) for sura in suras) == 6236
    return suras


def main() -> None:
    headers = {key: read_header(pathlib.Path(meta["file"]).name, meta["title"]) for key, meta in TEXT_TYPES.items()}
    assert headers["simple"]["copyright"] == headers["uthmani"]["copyright"]
    assert headers["simple"]["notice"].replace(headers["simple"]["name"], "") == headers["uthmani"]["notice"].replace(headers["uthmani"]["name"], "")
    simple = read_suras("quran-simple-clean.xml")
    uthmani = read_suras("quran-uthmani.xml")
    for suras in (simple, uthmani):
        assert [sura.attrib["index"] for sura in suras if "bismillah" not in sura.find("aya").attrib] == ["1", "9"]

    records = []
    for simple_sura, uthmani_sura in zip(simple, uthmani, strict=True):
        simple_ayas = simple_sura.findall("aya")
        uthmani_ayas = uthmani_sura.findall("aya")
        assert simple_sura.attrib["index"] == uthmani_sura.attrib["index"]
        assert len(simple_ayas) == len(uthmani_ayas)
        assert [aya.attrib["index"] for aya in simple_ayas] == [aya.attrib["index"] for aya in uthmani_ayas]
        record = {
            "number": int(simple_sura.attrib["index"]),
            "name": simple_sura.attrib["name"],
            "simple": [aya.attrib["text"] for aya in simple_ayas],
            "uthmani": [aya.attrib["text"] for aya in uthmani_ayas],
        }
        # Tanzil keeps the opening basmala in a separate attribute of verse 1 (all suras except 1 and 9); copied verbatim.
        if "bismillah" in uthmani_ayas[0].attrib:
            record["bismillah"] = {"simple": simple_ayas[0].attrib["bismillah"], "uthmani": uthmani_ayas[0].attrib["bismillah"]}
        records.append(record)

    assert sum(len(record["simple"]) for record in records) == 6236
    copyright_text = headers["simple"]["copyright"]
    output = {
        "attribution": f"Tanzil Quran Text, {copyright_text}, {LICENSE}. Verbatim verse text. https://tanzil.net/download/",
        "source": f"Tanzil Project (https://tanzil.net), Tanzil Quran Text release {VERSION}, downloaded from https://tanzil.net/download/",
        "license": f"{LICENSE}. {copyright_text}. Verbatim copies only: the Quran text must not be changed, Tanzil Project must be credited, and a link to tanzil.net must be provided.",
        "licenseUrl": "https://tanzil.net/docs/Text_License",
        "updatesUrl": "https://tanzil.net/updates/",
        "version": VERSION,
        "verseNumbering": "Kufi count, 114 suras and 6236 verses. The basmala opening each sura is kept outside the verses, so it is verse 1 only in Al-Fatiha and is absent from At-Tawbah. Each other sura record carries Tanzil's own opening basmala in `bismillah`.",
        "licenseNotice": {key: headers[key]["notice"] for key in TEXT_TYPES},
        "textTypes": {key: {"name": headers[key]["name"], **meta} for key, meta in TEXT_TYPES.items()},
        "suras": records,
    }
    with open(VENDOR / "quran-corpus.json", "w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
