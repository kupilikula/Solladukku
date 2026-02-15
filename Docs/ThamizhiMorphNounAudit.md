## Repo-level report: ThamizhiMorph noun source audit (master clone)

Repository cloned locally at:
`/Users/anandmurugan/Work/Tamil/game/solmaalai/tmp/thamizhi-morph-master`

---

## A) Repo Map

### 1) Noun lexicon(s)

**Path:** `_analysis/nouns/Nouns.lexc` (extracted from `foma/ThamizhiMorph-Nouns.zip`)  
**Why relevant:** Contains noun roots, class assignments, and inflection lexicons.

```text
7   LEXICON Root
9   nounClasses ;
11  LEXICON nounClasses
13  C1Sg;    !கடா, பசு
...
23  C11Sg;      !மாணவன்
24  C12Sg;      !புல்
```

```text
41202 LEXICON C11Inflections
41203 +noun+nom: #;
41210 +noun+acc:^னை #;
41213 +noun+inst:^னால் #;
41216 +noun+dat:^னுக்கு #;
```

---

### 2) Noun paradigm/class definitions

**Path:** `_analysis/nouns/Nouns.lexc`  
**Why relevant:** Explicit class inventory and per-class inflection lexicons.

```text
13 C1Sg;    !கடா, பசு
14 C2Sg;    !எலி, நெய்
...
22 C10Sg;      !பொன்
23 C11Sg;      !மாணவன்
...
29 C16Sg;      !சுவர்
```

The file defines these class families:
`C1Sg..C16Sg` (+ roots + inflections), with `C5pl` as plural class.

---

### 3) Morphophonological rewrite rules relevant to nouns

**Path:** `_analysis/nouns/tamil-noun.foma`  
**Why relevant:** Declares rewrite rules composed with noun lexicon.

```text
13 define R1 {்} -> 0 || LongChar CharSet1 _ "^" [{ி}|{ு}|{ோ}|{து}|{ை}|{ா}];
19 define R19 {ன்}-> 0 ||  _ "^" [{ற்த்}|{ற்ச்}|{ற்ட்}|{ற்ப்}];
20 define R6 {ன்} -> 0 || _ "^" [{ர்க}]; #For Manavan
21 define R7 {ன்} -> 0 || _ "^" [{னி}|{னோ}|{னா}|{னு}]; #For Manavan
22 define R18 {ன்}-> 0 ||  _ "^" [{த்}|{ச்}|{ட்}|{ப்}]; #For மாணவப்
```

```text
47 define TamilNouns Lexicon .o. R1 ... .o. R19 ... .o. CleanupX;
77 regex TamilNouns;
```

---

### 4) Build scripts / compile path to noun artifact

No project Makefile/build script was found that directly emits `noun.fst`.  
Build appears to be manual foma usage on source files in zip bundles.

Evidence:

**Path:** `foma/ReadMe`
```text
1 These compressed files contain lexc and foma files...
2 - Nouns
...
9 You can find the instructions ... here: fomafst.github.io
```

**Path:** `_analysis/nouns/tamil-noun.foma`
```text
9  read lexc Nouns.lexc
77 regex TamilNouns;
```

**Path:** `FST-Models/ReadMe.md` (artifact naming docs)
```text
18 ## FST Models for nouns:
19   - nouns.fst: the model for noun morphological analyser
20   - noun-guesser.fst: a guesser for noun morphology
```

---

## B) Build Trace

### Source -> compile -> artifact chain

1. `foma/ThamizhiMorph-Nouns.zip` contains:
   - `Nouns.lexc`
   - `tamil-noun.foma`

2. `tamil-noun.foma` does:
   - `read lexc Nouns.lexc`
   - `regex TamilNouns;` (lexicon composed with rewrite rules)

3. To emit a binary `.fst`, I ran:

```bash
cd tmp/thamizhi-morph-master/_analysis/nouns
cat > compile-noun.script <<'EOF'
source tamil-noun.foma
save stack noun-from-source.fst
quit
EOF
foma -f compile-noun.script
```

Output excerpt:
```text
read lexc Nouns.lexc ... 756.6 kB ... 15463 states ...
defined TamilNouns: 768.6 kB. 15526 states, 49012 arcs ...
Writing to file noun-from-source.fst.
```

4. Runtime invocation pattern (repo docs + observed):
```bash
echo <word> | flookup <noun-fst>
echo தமிழ் | flookup tamil-nouns.fst   # README wording
```

### Artifact naming mismatch

- Actual repo file: `FST-Models/noun.fst`
- Docs mention `nouns.fst` and `tamil-nouns.fst`

So code/users likely use `noun.fst` in practice.

---

## C) Noun class inventory

From `Nouns.lexc` class header, noun paradigms are explicitly encoded as 16 regular classes (plus one explicit plural class label `C5pl` among them).

| Class | Stem cue from comments/examples | Accusative pattern in class inflections | Core tags present |
|---|---|---|---|
| C1Sg | `கடா, பசு` | `^வை` | `+noun+nom,+acc,+inst,+dat,+soc,+abl,+gen,+loc,+pl` (+many sandhi/postposition variants) |
| C2Sg | `எலி, நெய்` | `^யை` | same |
| C3Sg | `ஈ` | `^யை` | same |
| C4Sg | `நாய், கால்` | `^ை` | same |
| C5pl | `பலர்` | class-specific plural stems | same family |
| C6Sg | `காடு` | class-specific | same |
| C7Sg | `வண்டு` | class-specific | same |
| C8Sg | `ஆறு` | class-specific | same |
| C9Sg | `கண்` | class-specific | same |
| C10Sg | `பொன்` | `^னை` | same |
| C11Sg | `மாணவன்` | `^னை` | same |
| C12Sg | `புல்` | class-specific | same |
| C13Sg | `முள்` | class-specific | same |
| C14Sg | `நாள்` | class-specific | same |
| C15Sg | `மரம்` | class-specific (`த்த...` alternants) | same |
| C16Sg | `சுவர்` | mixed `^ற்றை` / `^ை` alternants | same |

Notes:
- `README/site/paper` describe broader nominal class counts including pronouns (intended design).
- In this noun source file (`Nouns.lexc`), explicit class lexicons are these C1–C16 families.

---

## D) Shortcomings audit plan (overgeneration + undergeneration)

### 1) Generate noun forms from sample lemmas

```bash
cd tmp/thamizhi-morph-master
cat > _analysis/sample-lemmas.txt <<'EOF'
மாணவன்
திருமகன்
பொன்
சுவர்
மரம்
EOF

cat > _analysis/sample-tags.txt <<'EOF'
+noun+nom
+noun+acc
+noun+dat
+noun+inst
+noun+gen
+noun+abl
+noun+loc
+noun+soc
EOF

awk 'NR==FNR{t[++n]=$0;next}{for(i=1;i<=n;i++) print $0 t[i]}' \
  _analysis/sample-tags.txt _analysis/sample-lemmas.txt \
| flookup -i FST-Models/noun.fst \
> _analysis/generated-sample.tsv
```

### 2) Overgeneration probes

Suspicious `...ன்னை` from `+noun+acc`:
```bash
awk -F'\t' '$1 ~ /\+noun\+acc$/ && $2 ~ /ன்னை$/ {print}' _analysis/generated-sample.tsv
```

General suspicious doubled-ன் pattern:
```bash
awk -F'\t' '$2 ~ /ன்ன/ {print}' _analysis/generated-sample.tsv
```

Compare generated vs attested list (if you have gold lexicon/corpus):
```bash
cut -f2 _analysis/generated-sample.tsv | sort -u > _analysis/generated-forms.txt
sort -u /path/to/attested-forms.txt > _analysis/attested-forms.txt
comm -23 _analysis/generated-forms.txt _analysis/attested-forms.txt > _analysis/overgenerated.txt
```

### 3) Undergeneration probes

Known-valid forms failing analysis:
```bash
cat > _analysis/known-valid.txt <<'EOF'
மாணவனை
திருமகனை
EOF

flookup FST-Models/noun.fst < _analysis/known-valid.txt > _analysis/known-valid-analysis.tsv
awk -F'\t' '$2=="+?"{print "UNDERGEN:",$1}' _analysis/known-valid-analysis.tsv
```

### 4) Ambiguity audit

```bash
# For a candidate list, count analyses per surface
flookup FST-Models/noun.fst < _analysis/known-valid.txt \
| awk -F'\t' '$2!="+?"{c[$1]++} END{for(k in c) if(c[k]>1) print k,c[k]}' \
| sort -k2,2nr
```

---

## E) Case study: `...னை` vs `...ன்னை`

### Most likely rule locations

1. **Class inflection suffixes for C10/C11**  
   `_analysis/nouns/Nouns.lexc`
   ```text
   28006 +noun+acc:^னை #;   (C10)
   41210 +noun+acc:^னை #;   (C11)
   ```
   This appends `ன` in accusative suffix itself.

2. **Final-ன் deletion contexts in foma rules are limited**  
   `_analysis/nouns/tamil-noun.foma`
   ```text
   21 define R7 {ன்} -> 0 || _ "^" [{னி}|{னோ}|{னா}|{னு}];
   22 define R18 {ன்}-> 0 ||  _ "^" [{த்}|{ச்}|{ட்}|{ப்}];
   ```
   There is no corresponding deletion context for `^னை`.

3. **Composition pipeline applies these rules globally**  
   `_analysis/nouns/tamil-noun.foma`
   ```text
   define TamilNouns Lexicon .o. R1 ... .o. R19 ... ;
   regex TamilNouns;
   ```

### Minimal reproduction (local)

Commands run:
```bash
cd tmp/thamizhi-morph-master
printf 'திருமகன்+noun+acc\n' | flookup -i FST-Models/noun.fst
printf 'மாணவன்+noun+acc\n' | flookup -i FST-Models/noun.fst
printf 'திருமகனை\nதிருமகன்னை\nமாணவனை\n' | flookup FST-Models/noun.fst
```

Observed:
```text
திருமகன்+noun+acc    திருமகன்னை
மாணவன்+noun+acc     மாணவன்னை

திருமகனை   +?
திருமகன்னை திருமகன்+noun+acc
மாணவனை    +?
```

Interpretation:
- The noun FST generates/analyzes `...ன்னை` for these `...ன்` lemmas in accusative.
- `...னை` is rejected in these tested cases.
- This directly supports an overgeneration + undergeneration issue around accusative allomorph handling for some `ன்`-final nouns.

---

## Commands run (requested exploration order)

1. Top-level tree (depth 3): done.
2. Noun/paradigm/tag ripgrep: done.
3. Gemination/doubling pattern search: done (targeted in noun source files).
4. Opened noun sources under `foma` (unzipped): done.
5. Reconstructed compile path and executed local compile: done.
6. Ran `flookup` analyze/inverse reproduction for `...ன்` accusative cases: done.

---

## Light external consultation (intended design only)

- Project site: https://sarves.github.io/thamizhi-morph/  
- Paper record: https://link.springer.com/article/10.1007/s10590-021-09261-5  

Used only for terminology/context (paradigm/class counts); repository source files above were treated as ground truth for implementation behavior.
