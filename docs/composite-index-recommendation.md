# Neighborhood Stability Index — Design Recommendation

Reviewed against Esri, *Creating Composite Indices Using ArcGIS: Best Practices* (v2, May 2024)
and tested against the 533 non-screened tracts currently on `Stability_Tracts/FeatureServer/0`.

---

## 1. What the Esri paper actually prescribes

Ten steps. The ones that bind on this project:

| Step | Guidance that matters here |
|---|---|
| 1. Define question & dimensions | Define the question *first*, then dimensions, then variables. Draw the hierarchy. |
| 2. Choose & weight variables | More variables ≠ better. "The inclusion of any additional indicators should be underpinned by clear theoretical reasons" (Allik et al. 2020). Prefer variables about **what people experience** over **who people are**. Be as specific as possible; use proxies only with stated limitations. |
| 3. Study area & spatial unit | Percentiles and z-scores are *relative to the study area*. A six-county index is not a national index. Use the smallest unit available (tracts) to limit MAUP. |
| 4. Prepare variables | Inspect histograms, nulls, outliers, skew before deciding anything. Convert geographies on **raw counts, never on rates**. |
| 5. Preprocess | Reverse for consistent direction; scale for consistent range. Magnitude methods (min-max) vs rank methods (percentile). Rank methods are robust to skew/outliers but discard magnitude. Avoid binning into classes. |
| 6. Combine | Additive (sum/mean) is **compensatory**; multiplicative (geometric mean) is **partially non-compensatory**. Use additive when values can be negative or zero. Weights multiply for additive, exponentiate for multiplicative. |
| 7. Postprocess | Confirm index direction matches the title. Rescale to an interpretable range (0–100). |
| 8. Investigate | Scatterplot matrix + Pearson's R against the index. Correlated variables cause **unintentional weighting**. Low-variance variables contribute nothing. |
| 9. Sub-indices | **Mean** within a sub-index corrects for differing variable counts (sum does not). Z-scoring the sub-indices before final combination equalizes variance and neutralizes correlation-driven weighting. |
| 10. Explore | Vary the methods and compare `index_rank` change to measure sensitivity. Validate with regression against a measurable outcome. |

The paper is candid that every step is subjective, and it defers to OECD (2008) for the statistics.

---

## 2. The problem this project has right now

Your framing is that **stability is a precondition for economic mobility** — the Chetty/Sampson
proposition that what lifts children's outcomes is not neighborhood affluence but neighborhood
*continuity*: stable tenure, stable institutions, stable adult networks.

That thesis only has teeth if the index measures something a poverty map doesn't already show.
It currently does not. I built the naive index — all 15 indicators live in `fieldMeta.js`,
percentile-scaled, equal weight, direction-corrected — and compared it to the poverty rate:

```
Naive equal-weight index vs. pct_below_200_poverty : Spearman r = +0.89
Naive equal-weight index vs. median_hh_income      : Spearman r = -0.88
```

**It is a poverty map.** Publishing it as a stability index would assert something the data
doesn't support, and it would tell your stakeholders nothing they couldn't get from a single
ACS variable.

The cause is variable selection, not arithmetic. Ranked against the poverty axis:

| Correlates strongly with poverty (r ≥ 0.55) | Nearly independent of poverty (\|r\| ≤ 0.26) |
|---|---|
| `pct_hh_lowinc_burdened` 0.82 | `pct_renter_moved_recent` **0.02** |
| `pct_snap_or_pubassist` 0.79 | `pct_commute_gt45` −0.03 |
| `pct_no_hs_diploma` 0.77 | `pct_renter_moved_5yr` −0.18 |
| `pct_single_parent_fam` 0.71 | `pct_moved_within_county` 0.23 |
| `pct_cost_burden` 0.66 | `pct_moved_last_year` 0.24 |
| `pct_renter_occupied` 0.63, `pct_no_vehicle` 0.63, `pct_vacant` 0.60, `pct_no_internet` 0.60 | |

Every genuine *churn* measure — the actual stability signal — sits in the right-hand column,
and there are only three or four of them against eleven deprivation measures. Equal weighting
therefore hands ~75% of the index to deprivation. This is exactly the unintentional weighting
the paper warns about in Step 8, arriving through variable counts rather than correlation.

I tested the paper's Step 9 remedy (sub-indices, z-scaled before combination). It does **not**
rescue this, because three of the four dimensions are themselves poverty proxies:

```
Residential Continuity  vs poverty  +0.42
Housing Cost Precarity  vs poverty  +0.77
Economic Footing        vs poverty  +0.72
Connection & Access     vs poverty  +0.80
   -> 4-dimension index vs poverty  +0.85   (barely better than naive)
```

The fix has to happen in Step 2.

---

## 3. Recommended design

### 3.1 Question

> Which neighborhoods in the six-county region offer residents the continuity — in housing,
> tenure, and household footing — that lets them convert effort into upward mobility, and which
> are churning in ways that reset that progress?

### 3.2 Cut the "Connection & Access" dimension

Drop `pct_no_vehicle`, `pct_no_internet`, `pct_no_hs_diploma`, `pct_limited_english`,
`pct_commute_gt15` from the index.

They measure **access to opportunity**, not **stability**. They are also the most
poverty-saturated block you have (dimension r = 0.80). Per Step 2's specificity rule, a
variable belongs in the index only if it represents the dimension the index is about — adult
educational attainment is a stock characteristic of who lives there now, not a measure of
whether the neighborhood holds together.

Keep them in the app as context layers. They are good map layers and bad index inputs.

### 3.3 Three dimensions

Sub-indices, deliberately unequal weights, high = **less stable**:

**Dimension 1 — Residential Continuity (weight 0.40)**
The defining dimension, and the one that carries information no poverty map has.

| Field | B table | Rationale |
|---|---|---|
| `pct_renter_moved_recent` | B25038 (010 / 009) | Renter turnover in the past year. The sharpest churn signal; r=0.02 with poverty. |
| `pct_renter_moved_5yr` | B25038 (010+011 / 009) | Medium-run turnover; separates chronic churn from a one-year blip. |
| `pct_vacant_other` | B25004 (008 / B25002_001) | Vacant and *not* for rent or sale — abandonment, not market slack. |

**Dimension 2 — Housing Security (weight 0.30)**
Displacement pressure: can a household afford to stay put?

| Field | B table | Rationale |
|---|---|---|
| `pct_severe_cost_burden` | B25070 + B25091 | 50%+ of income on housing — the forced-move threshold, not the 30% discomfort threshold. |
| `pct_hh_lowinc_burdened` | B25106 | Share of *all* households both under $35k and burdened. Your script is right to prefer this over `pct_lowinc_cost_burden`, which saturates (median 86.9, skew −1.29) and is uncorrelated with the other burden measures (r=0.04). |
| `pct_overcrowded` | B25014 | Doubling up is usually a precursor to a move. |

**Dimension 3 — Economic Footing (weight 0.30)**
Can a household absorb a shock without relocating?

| Field | B table | Rationale |
|---|---|---|
| `pct_prime_unemployed` | B23001 (25–54) | Correctly avoids the retiree distortion in B23025. |
| `pct_prime_lfp` *(reversed)* | B23001 | Detachment from the labor market. |
| `pct_snap_or_pubassist` | B19058 (002 / 001) | Thin financial margin. |

This dimension will correlate with poverty (~0.72) and **that is legitimate** — a household with
no cushion genuinely is less stable. The error is letting it dominate, which the 0.40/0.30/0.30
weighting prevents.

Result: index vs. poverty falls to **r ≈ 0.70**. High enough that deprivation still registers,
low enough that the index carries real independent information. It newly separates **48 tracts**
that run high-churn but below-median-poverty — invisible to the current design, and precisely
the places your thesis predicts will underperform on mobility despite looking fine on income.

### 3.4 Calculation

```
1. Scale each variable      -> PERCENTILE (0-100) across the 533 screened tracts
2. Reverse pct_prime_lfp    -> 100 - percentile
3. Within each dimension    -> MEAN of its scaled variables      (Step 9: mean, not sum,
                                                                  corrects for 3-vs-3 counts)
4. Scale each sub-index     -> Z-SCORE                            (Step 9: equalizes variance,
                                                                  neutralizes cross-dimension
                                                                  correlation)
5. Combine                  -> 0.40*z(Continuity) + 0.30*z(Housing) + 0.30*z(Footing)
6. Postprocess              -> MIN-MAX rescale to 0-100
```

**Why percentile at step 1.** Your inputs are severely skewed — I measured skew of 2.76 on
`pct_renter_moved_recent`, 2.75 on `pct_no_vehicle`, 2.11 on `pct_snap_or_pubassist`. Min-max
scaling on these compresses most tracts near zero and, per the paper, "may result in a less
meaningful contribution to the index." Percentile converts to uniform and is outlier-robust.
The paper explicitly endorses it for this class of question: "a resource allocation index used
to find the most deprived locations in a city may use the percentile method... because it's more
important to quantify whether locations are better or worse than other locations, rather than
how much better or worse they are."

**Why additive at step 5.** Z-scores are negative for roughly half the tracts, and the paper is
explicit that multiplicative methods misbehave on negative values. If you want the
non-compensatory behavior of a geometric mean — defensible here, since catastrophic churn
arguably *shouldn't* be offset by decent employment — you must keep the sub-indices on a
positive scale (percentile, not z-score) and give up the variance equalization. You cannot have
both; I'd take the variance equalization.

**Direction.** High = less stable = more need, matching CDC SVI convention and your existing
`direction: "high"` semantics. Name it accordingly — *Neighborhood Instability Index*, or keep
"Stability" and reverse the whole thing at step 6. Do not ship an index whose name and direction
disagree (Step 7).

### 3.5 Optional: the conditional version

If you want to ask the sharper Chetty question — *is this neighborhood more stable than its
income level would predict?* — regress the Housing + Footing half on `log(median_hh_income)` and
use the residual, keeping Continuity intact. That drops index-vs-poverty to **r = 0.38** and
reframes the map as "stability net of affluence."

It is a genuinely different and more interesting question, and it is harder to explain to a
board. It also is not in the Esri paper. Treat it as a second map, not a replacement.

---

## 4. Validation (Steps 8 and 10)

1. **Scatterplot matrix** of the index against all nine preprocessed inputs. Confirm no single
   variable carries the index and that each dimension's box plots show comparable spread.
2. **Sensitivity.** Re-run with min-max instead of percentile, and with equal weights instead of
   40/30/30. Compare `index_rank` deltas from the Calculate Composite Index output. Large rank
   swings mean the design is fragile and the weights need a stronger public rationale.
3. **Spatial structure.** Hot Spot Analysis and Cluster and Outlier Analysis. Spatial outliers
   often reveal a single variable driving an artifact.
4. **Outcome regression — do this one.** Opportunity Insights' Opportunity Atlas publishes
   tract-level measured upward-mobility estimates for the KC metro. Regress those on your index
   with Generalized Linear Regression. That is a direct empirical test of your entire premise, it
   is the validation the paper recommends in Step 10, and it will be the first question a
   skeptical reviewer asks.

---

## 5. Two limitations to document

- **Margins of error.** `INCLUDE_MOE = False` in `01_acs_tracts.py`, so nothing downstream knows
  how uncertain these estimates are. Tract-level ACS 5-year MOEs are wide — a rate of 5% ± 8% is
  common — and percentile ranking assigns such a tract a precise rank it hasn't earned. Consider
  pulling the `_M` columns and at minimum flagging tracts whose MOE exceeds their estimate.
- **Study-area dependence.** Percentile scaling makes every value relative to these six counties
  and this vintage. The index is not comparable to other metros, and not comparable across years.
  If year-over-year comparison is ever a requirement, switch to min-max with a fixed custom range
  (Step 5) before you publish a baseline people will want to trend.

## 6. Worth adding if you can get it

- **Eviction filings** (Eviction Lab, or Jackson/Wyandotte county court records). The single best
  direct measure of forced residential instability, and entirely absent from ACS.
- **Long-tenure share.** You already pull `renter_moved_pre1990` and `owner_moved_2023plus` in
  B25038 but derive no rate from them. A "households in place 10+ years" rate would be a
  protective, reverse-coded continuity measure and would balance a dimension that is currently
  all-negative.
