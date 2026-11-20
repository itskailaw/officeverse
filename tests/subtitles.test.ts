import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSubtitle } from "../lib/subtitles/index.ts";

// a tiny synthetic .cip in the same layout as the real files (no client content)
const hdr = (n: number, a: string, b: string, d: string, cc = "CC52000") =>
  `\\protect0\\pard\\protect\\tx1320\\tx2933\\tx4546\\tx6160\\tx8066\\cf2\\highlight2\\b\\f0 #${"0".repeat(5 - String(n).length)}\\cf3 ${n}\\tab ${a}\\tab ${b}\\tab\\cf2 00:00:0\\cf3 ${d}\\tab #F\\tab ${cc}\\cf2 D0\\cf3\\tab\\cf2 #C\\cf3  \\cf0\\highlight0\\b0\\f1\\par\r\n\r\n`;
const txt = (body: string) => `\\protect0\\pard\\protect\\li1095\\ri855\\qc\\tx1320\\tx2933\\tx4546\\tx6160\\tx8066\\b\\protect0\\f2\\fs45 ${body}\\b0\\protect\\f1\\fs22\\par\r\n\r\n`;
const CIP =
  "{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat\\deflang1033{\\fonttbl{\\f0\\fnil\\fcharset0 Tahoma;}{\\f1\\fswiss Helvetica;}{\\f2\\fnil\\fcharset0 Courier New;}}\r\n" +
  "{\\*\\generator Riched20 10.0.26100}\\viewkind4\\uc1 \r\n\\pard\\tx1320\\cf1\\highlight2\\b\\f0\\fs22 FILE_INFO_BEGIN\\par\r\nORIG_TITLE: Demo\\par\r\nLANG_CO: Malaysian\\par\r\nTV_FPS: EBU 625/50\\par\r\nLINE_LEN: 43.2\\par\r\nFILE_INFO_END\\par\r\n" +
  hdr(1, "00:00:12.23", "00:00:15.16", "2.18", "CC49000") +
  txt("Baris satu\\b0\\f1\\fs22\\par\r\n\\b\\f2\\fs45 baris dua.") +
  hdr(2, "00:00:18.05", "00:00:19.00", "0.20") +
  txt("\\lang17417 ...\\lang1033 satu baris\\line lagi") +
  "}\r\n";

test(".cip: reads numbers, frame timecodes and lines; unchanged write is byte-identical", () => {
  const d = parseSubtitle(CIP, "cip");
  assert.equal(d.fps, 25);
  assert.equal(d.meta.LANG_CO, "Malaysian");
  assert.deepEqual(d.cues.map((c) => [c.n, c.startMs, c.endMs, c.lines]), [
    [1, 12920, 15640, ["Baris satu", "baris dua."]],
    [2, 18200, 19000, ["...satu baris", "lagi"]],
  ]);
  assert.equal(d.write(new Map()), CIP);
});

test(".cip: translated text is escaped and everything else stays put", () => {
  const d = parseSubtitle(CIP, "cip");
  const out = d.write(new Map([[1, ["你好 {x}\\", "第二行"]], [2, ["One", "two"]]]), { meta: { LANG_CO: "Chinese" } });
  const d2 = parseSubtitle(out, "cip");
  assert.deepEqual(d2.cues.map((c) => c.lines), [["你好 {x}\\", "第二行"], ["One", "two"]]);
  assert.deepEqual(d2.cues.map((c) => [c.inTC, c.outTC]), d.cues.map((c) => [c.inTC, c.outTC]));
  assert.equal(d2.meta.LANG_CO, "Chinese");
  assert.ok(/^[\x00-\x7f]*$/.test(out), "ASCII-only RTF");
  assert.ok(out.includes("satu\\b0") === false && out.includes("One\\line two"), "keeps \\line as the separator where the original used it");
  // the header paragraphs are untouched
  const hdrs = (s: string) => s.match(/#0*\\cf3 \d+\\tab[^\r\n]*/g);
  assert.deepEqual(hdrs(out), hdrs(CIP));
});

test(".srt / .vtt / .sbv / .ass: text swapped, the rest byte-identical", () => {
  const srt = "1\r\n00:00:01,000 --> 00:00:02,500\r\n<i>Hello</i>\r\nthere\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nBye\r\n";
  const s = parseSubtitle(srt, "srt");
  assert.deepEqual(s.cues.map((c) => [c.n, c.startMs, c.endMs, c.lines]), [[1, 1000, 2500, ["<i>Hello</i>", "there"]], [2, 3000, 4000, ["Bye"]]]);
  assert.equal(s.write(new Map()), srt);
  assert.equal(s.write(new Map([[2, ["Selamat", "tinggal"]]])), srt.replace("Bye", "Selamat\r\ntinggal"));

  const vtt = "WEBVTT\n\nNOTE keep me\n\nintro\n00:01.000 --> 00:02.000 align:start\nHi\n";
  const v = parseSubtitle(vtt, "vtt");
  assert.deepEqual(v.cues[0].lines, ["Hi"]);
  assert.equal(v.write(new Map([[1, ["Hai"]]])), vtt.replace("\nHi\n", "\nHai\n"));

  const sbv = "0:00:01.000,0:00:02.000\nOne\n\n0:00:03.000,0:00:04.000\nTwo\n";
  assert.equal(parseSubtitle(sbv, "sbv").write(new Map([[2, ["Dua"]]])), sbv.replace("Two", "Dua"));

  const ass = "[Script Info]\nTitle: x\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\i1}Hello,{\\i0} you\\Nthere\n";
  const a = parseSubtitle(ass, "ass");
  assert.deepEqual(a.cues[0].lines, ["{\\i1}Hello,{\\i0} you", "there"]);
  assert.equal(a.write(new Map([[1, ["{\\i1}Hai,{\\i0} awak", "di sana"]]])), ass.replace("{\\i1}Hello,{\\i0} you\\Nthere", "{\\i1}Hai,{\\i0} awak\\Ndi sana"));
});

// Chinese .cip: GBK bytes (\'hh pairs) in a font declared as GB2312 (\fcharset134)
const zhCip = (charset: number) =>
  `{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\fnil\\fcharset0 Tahoma;}{\\f2\\fnil\\fcharset${charset} SimSun;}}\r\n\\viewkind4\\uc1 \r\n\\pard\\f0\\fs22 FILE_INFO_BEGIN\\par\r\nLANG_CO: Chinese\\par\r\nTV_FPS: EBU 625/50\\par\r\nFILE_INFO_END\\par\r\n` +
  hdr(1, "00:00:01.00", "00:00:03.00", "2.00") +
  txt("\\'ba\\'c3\\'cf\\'e3\\'a3\\'a1\\b0\\f1\\fs22\\par\r\n\\b\\f2\\fs45 400\\'c4\\'ea\\'c7\\'b0") +
  hdr(2, "00:00:04.00", "00:00:05.00", "1.00") +
  txt("\\'d5\\'e2\\'ca\\'c7\\'b0\\'d9\\'c0\\'ef\\'cf\\'e3") +
  "}\r\n";

test(".cip: Chinese GBK text is decoded, and written back in GBK", () => {
  for (const cs of [134, 0]) {
    // 0 = file wrongly says Western: detected from the bytes
    const raw = zhCip(cs);
    const d = parseSubtitle(raw, "cip");
    assert.deepEqual(d.cues.map((c) => c.lines), [["好香！", "400年前"], ["这是百里香"]], `charset ${cs}`);
    assert.equal(d.write(new Map()), raw);
    const out = d.write(new Map([[2, ["百里香"]]]));
    assert.ok(out.includes("\\'b0\\'d9\\'c0\\'ef\\'cf\\'e3"), "GBK bytes, like the original");
    assert.deepEqual(parseSubtitle(out, "cip").cues[1].lines, ["百里香"]);
  }
  // Malay translation into the Chinese file: plain ASCII
  const d = parseSubtitle(zhCip(134), "cip");
  assert.deepEqual(parseSubtitle(d.write(new Map([[1, ["Wanginya!", "400 tahun dulu"]]])), "cip").cues[0].lines, ["Wanginya!", "400 tahun dulu"]);
  // manual override
  assert.notDeepEqual(parseSubtitle(zhCip(134), "cip", { encoding: "windows-1252" }).cues[1].lines, ["这是百里香"]);
});
