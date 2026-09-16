"""
01_acs_tracts.py — ACS tract (and ZCTA) table builder
=====================================================
One script: download ACS 5-year tract data for a list of B tables, rename the
columns you care about, optionally build simple shares, join tract geometry,
and write a GeoParquet for ArcGIS Pro.

The same fields, rates, and small-sample screen are also built for ZIP Code
Tabulation Areas (ZCTAs), for the Stability Explorer's ZIP selector. ZCTA rows
come out of the same summary-file downloads (every .dat file carries every
geography), so this adds no extra downloads. The ZCTA list and geometry come
from the app's zcta_kc.geojson, and the results are written back into that
file's properties — see section 6.

The output is deliberately *un-combined* — no z-scores, no percentiles, no
composite. Scaling and weighting happen interactively in the ArcGIS Pro
"Calculate Composite Index" tool so the index can be iterated on graphically
before anything is hardcoded here. The only derived things it produces are
shares (RATES), because the index tool can't turn counts into rates itself,
and an "exclude" yes/no flag (SCREEN) for filtering tiny-population tracts.

This is a wide menu on purpose — more indicators than any one version of the
index should use. Pick the subset that matters when you build the index in
ArcGIS; there's no obligation to feed all of them to the tool.

One non-ACS indicator rides along: pct_evict_filing_rate, an eviction filing
rate built from Eviction Lab's tract-proprietary file (see section 5).

To add an indicator:
  1. add the table code to ACS_TABLES
  2. add the lines you want to COLUMNS (one field each) or COLUMN_GROUPS
     (several lines summed into one field). See Data/column_lookup.csv for
     what every line in every listed table is.
  3. optionally add a share to RATES
  4. rerun

Inputs:  Census summary file server + tract geometry from SixCountyBase.gdb
         Data/Eviction/moks_tract_proprietary_2000_2018.csv
         Census 2010->2020 tract relationship files (downloaded, then cached in
           Data/Eviction/)
         stability-tract-explorer/src/assets/zcta_kc.geojson (ZIP list + geometry)
Outputs: Data/Output/acs_tracts.parquet   (GeoParquet — open this in ArcGIS)
         Data/Output/acs_tracts.csv       (same table, no geometry)
         Data/Output/acs_zctas.csv        (same fields for ZCTAs, no geometry)
         stability-tract-explorer/src/assets/zcta_kc.geojson (ZCTA fields joined in)
         Data/column_lookup.csv           (every line in every ACS_TABLES table)
         Data/Output/acs_tracts_metadata.json

Usage:
  python 01_acs_tracts.py

Counties covered:
  Wyandotte County, KS (20-209)   Johnson County, KS  (20-091)
  Platte County, MO   (29-165)    Clay County, MO     (29-047)
  Jackson County, MO  (29-095)    Cass County, MO     (29-037)
"""

import json
import logging
import re
import sys
from datetime import datetime
from io import BytesIO
from pathlib import Path

import geopandas as gpd
import pandas as pd
import requests
from tqdm import tqdm
import truststore
truststore.inject_into_ssl()


LOG_FORMAT = "%(asctime)s [%(levelname)s] %(message)s"
logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
logger = logging.getLogger(__name__)

# ===========================================================================
# CONFIG — everything you normally touch lives between here and MAIN
# ===========================================================================

ACS_YEAR = 2024  # 5-year release; 2024 == 2020–2024

BASE_DIR   = Path(__file__).resolve().parent.parent
DATA_DIR   = BASE_DIR / "Data"
OUTPUT_DIR = DATA_DIR / "Output"

# Tract geometry — read straight from the GIS_Share geodatabase, no TIGER
# download. Set TRACT_GDB_PATH to None to skip the join and write a plain
# (non-spatial) parquet instead.
TRACT_GDB_PATH  = Path(r"C:/Users/BrianWize/Box/Brian Wize/GIS_Share/SixCountyBase.gdb")
TRACT_GDB_LAYER = "Tracts_SD"

COUNTIES = {
    "Wyandotte County, KS": {"state": "20", "county": "209"},
    "Johnson County, KS":   {"state": "20", "county": "091"},
    "Platte County, MO":    {"state": "29", "county": "165"},
    "Clay County, MO":      {"state": "29", "county": "047"},
    "Jackson County, MO":   {"state": "29", "county": "095"},
    "Cass County, MO":      {"state": "29", "county": "037"},
}

# ---------------------------------------------------------------------------
# 1. Tables to download — add/remove freely
# ---------------------------------------------------------------------------

ACS_TABLES = [
    # --- Housing cost -----------------------------------------------------
    "B25070",  # Gross rent as % of household income (renter cost burden)
    "B25091",  # Selected monthly owner costs as % of income (owner cost burden)
    "B25106",  # Tenure x household income x housing cost as % of income
    "B25064",  # Median gross rent
    "B25077",  # Median home value

    # --- Housing stock / conditions ---------------------------------------
    "B25003",  # Tenure (owner vs renter)
    "B25002",  # Occupancy status (occupied vs vacant)
    "B25004",  # Vacancy status (why units are vacant)
    "B25014",  # Tenure by occupants per room (overcrowding)
    "B25035",  # Median year structure built

    # --- Residential churn ------------------------------------------------
    "B25038",  # Tenure by year householder moved into unit
    "B07003",  # Geographic mobility in the past year by sex

    # --- Transportation ---------------------------------------------------
    "B25044",  # Tenure by vehicles available
    "B08303",  # Travel time to work
    "B08301",  # Means of transportation to work

    # --- Employment -------------------------------------------------------
    "B23025",  # Employment status for the population 16+
    "B23001",  # Sex by age by employment status (supports prime-age 25-54)
    "B24080",  # Sex by class of worker (self-employment)

    # --- Economic security ------------------------------------------------
    "B17024",  # Age by ratio of income to poverty level (detailed; replaces C17002)
    "B19058",  # Public assistance income or SNAP
    "B19013",  # Median household income
    "B19083",  # Gini index of income inequality

    # --- Human capital / access -------------------------------------------
    "B15003",  # Educational attainment, population 25+
    "B28002",  # Internet subscription
    "C16002",  # Household limited English speaking status

    # --- Household / family composition -----------------------------------
    "B11003",  # Family type by presence and age of own children under 18

    # --- Screening denominators -------------------------------------------
    "B11001",  # Household type (household count)
    "B26001",  # Group quarters population
    "B01001",  # Sex by age (total population)
]

# ---------------------------------------------------------------------------
# 2. Column renames — {ACS line code: output field name}
# ---------------------------------------------------------------------------
# Line codes may be written any of these three ways; they all normalize to the
# same summary-file column:
#     B25070_001E   (Census API style)
#     B25070_E001   (summary-file .dat style)
#     B25070_001    (table shell style)
#
# Anything listed here is renamed and kept. Anything not listed is dropped
# unless KEEP_UNNAMED_COLUMNS is True.
#
# Field names are for ArcGIS: keep them <=31 chars, letters/digits/underscore
# only, and don't start with a digit. The script warns if they aren't.

COLUMNS = {
    # --- Renter cost burden (B25070) --------------------------------------
    "B25070_001E": "renter_hh",
    "B25070_007E": "rent_30_34",
    "B25070_008E": "rent_35_39",
    "B25070_009E": "rent_40_49",
    "B25070_010E": "rent_50_plus",

    # --- Owner cost burden (B25091) ---------------------------------------
    "B25091_001E": "owner_hh",
    "B25091_008E": "own_mtg_30_34",
    "B25091_009E": "own_mtg_35_39",
    "B25091_010E": "own_mtg_40_49",
    "B25091_011E": "own_mtg_50_plus",
    "B25091_019E": "own_nomtg_30_34",
    "B25091_020E": "own_nomtg_35_39",
    "B25091_021E": "own_nomtg_40_49",
    "B25091_022E": "own_nomtg_50_plus",

    # --- Cost burden by income bracket (B25106) ---------------------------
    # Isolates cost burden among *low-income* households, a sharper stability
    # signal than overall cost burden — a high earner paying 31% of income
    # isn't unstable in the way this index means it. See COLUMN_GROUPS.

    "B25106_001E": "costinc_hh_total",
    "B25106_023E": "owner_zero_neg_income",
    "B25106_045E": "renter_zero_neg_income",
    "B25106_046E": "renter_no_cash_rent",



    # B25106|1.0|0|B25106_001|Total:|Occupied housing units|int
    # B25106|2.0|1|B25106_002|Owner-occupied housing units:|Occupied housing units|int
    # B25106|3.0|2|B25106_003|Less than $20,000:|Occupied housing units|int
    # B25106|4.0|3|B25106_004|Less than 20 percent|Occupied housing units|int
    # B25106|5.0|3|B25106_005|20 to 29 percent|Occupied housing units|int
    # B25106|6.0|3|B25106_006|30 percent or more|Occupied housing units|int
    # B25106|7.0|2|B25106_007|$20,000 to $34,999:|Occupied housing units|int
    # B25106|8.0|3|B25106_008|Less than 20 percent|Occupied housing units|int
    # B25106|9.0|3|B25106_009|20 to 29 percent|Occupied housing units|int
    # B25106|10.0|3|B25106_010|30 percent or more|Occupied housing units|int
    # B25106|11.0|2|B25106_011|$35,000 to $49,999:|Occupied housing units|int
    # B25106|12.0|3|B25106_012|Less than 20 percent|Occupied housing units|int
    # B25106|13.0|3|B25106_013|20 to 29 percent|Occupied housing units|int
    # B25106|14.0|3|B25106_014|30 percent or more|Occupied housing units|int
    # B25106|15.0|2|B25106_015|$50,000 to $74,999:|Occupied housing units|int
    # B25106|16.0|3|B25106_016|Less than 20 percent|Occupied housing units|int
    # B25106|17.0|3|B25106_017|20 to 29 percent|Occupied housing units|int
    # B25106|18.0|3|B25106_018|30 percent or more|Occupied housing units|int
    # B25106|19.0|2|B25106_019|$75,000 or more:|Occupied housing units|int
    # B25106|20.0|3|B25106_020|Less than 20 percent|Occupied housing units|int
    # B25106|21.0|3|B25106_021|20 to 29 percent|Occupied housing units|int
    # B25106|22.0|3|B25106_022|30 percent or more|Occupied housing units|int
    # B25106|23.0|2|B25106_023|Zero or negative income|Occupied housing units|int
    # B25106|24.0|1|B25106_024|Renter-occupied housing units:|Occupied housing units|int
    # B25106|25.0|2|B25106_025|Less than $20,000:|Occupied housing units|int
    # B25106|26.0|3|B25106_026|Less than 20 percent|Occupied housing units|int
    # B25106|27.0|3|B25106_027|20 to 29 percent|Occupied housing units|int
    # B25106|28.0|3|B25106_028|30 percent or more|Occupied housing units|int
    # B25106|29.0|2|B25106_029|$20,000 to $34,999:|Occupied housing units|int
    # B25106|30.0|3|B25106_030|Less than 20 percent|Occupied housing units|int
    # B25106|31.0|3|B25106_031|20 to 29 percent|Occupied housing units|int
    # B25106|32.0|3|B25106_032|30 percent or more|Occupied housing units|int
    # B25106|33.0|2|B25106_033|$35,000 to $49,999:|Occupied housing units|int
    # B25106|34.0|3|B25106_034|Less than 20 percent|Occupied housing units|int
    # B25106|35.0|3|B25106_035|20 to 29 percent|Occupied housing units|int
    # B25106|36.0|3|B25106_036|30 percent or more|Occupied housing units|int
    # B25106|37.0|2|B25106_037|$50,000 to $74,999:|Occupied housing units|int
    # B25106|38.0|3|B25106_038|Less than 20 percent|Occupied housing units|int
    # B25106|39.0|3|B25106_039|20 to 29 percent|Occupied housing units|int
    # B25106|40.0|3|B25106_040|30 percent or more|Occupied housing units|int
    # B25106|41.0|2|B25106_041|$75,000 or more:|Occupied housing units|int
    # B25106|42.0|3|B25106_042|Less than 20 percent|Occupied housing units|int
    # B25106|43.0|3|B25106_043|20 to 29 percent|Occupied housing units|int
    # B25106|44.0|3|B25106_044|30 percent or more|Occupied housing units|int
    # B25106|45.0|2|B25106_045|Zero or negative income|Occupied housing units|int
    # B25106|46.0|2|B25106_046|No cash rent|Occupied housing units|int



    # --- Housing cost levels (medians — see JAM_VALUE_FLOOR) --------------
    "B25064_001E": "median_gross_rent",
    "B25077_001E": "median_home_value",

    # --- Tenure / occupancy / vacancy -------------------------------------
    "B25003_002E": "owner_occupied",
    "B25003_003E": "renter_occupied",
    "B25002_001E": "housing_units",
    "B25002_002E": "hu_occupied",
    "B25002_003E": "hu_vacant",
    "B25004_002E": "vacant_for_rent",
    "B25004_004E": "vacant_for_sale",
    "B25004_008E": "vacant_other",
    "B25035_001E": "median_year_built",

    # --- Residential churn (B25038) ---------------------------------------
    # Preferred over B07003 for churn: separates renters from owners (renter
    # churn is the distress signal; owner moves mostly aren't) and gives
    # length of tenure directly rather than a one-year snapshot.
    "B25038_002E": "owner_hh_tenure",
    "B25038_003E": "owner_moved_2023plus",
    "B25038_009E": "renter_hh_tenure",
    "B25038_010E": "renter_moved_2023plus",
    "B25038_015E": "renter_moved_pre1990",

    # --- Geographic mobility (B07003) -------------------------------------
    "B07003_001E": "mobility_universe",
    "B07003_004E": "same_house_1yr",
    "B07003_007E": "moved_within_county",
    "B07003_010E": "moved_diff_county",
    "B07003_013E": "moved_diff_state",
    "B07003_016E": "moved_from_abroad",

    # --- Vehicle access (B25044) ------------------------------------------
    "B25044_001E": "occupied_hh",
    "B25044_003E": "owner_no_vehicle",
    "B25044_010E": "renter_no_vehicle",

    # --- Commute time (B08303) --------------------------------------------
    "B08303_001E": "workers_16plus",
    "B08303_002E": "commute_lt5",
    "B08303_003E": "commute_5_9",
    "B08303_004E": "commute_10_14",
    "B08303_005E": "commute_15_19",
    "B08303_006E": "commute_20_24",
    "B08303_007E": "commute_25_29",
    "B08303_008E": "commute_30_34",
    "B08303_009E": "commute_35_39",
    "B08303_010E": "commute_40_44",
    "B08303_011E": "commute_45_59",
    "B08303_012E": "commute_60_89",
    "B08303_013E": "commute_90_plus",

    # --- Means of transportation (B08301) ---------------------------------
    "B08301_003E": "drove_alone",
    "B08301_004E": "carpooled",
    "B08301_010E": "public_transit",
    "B08301_019E": "walked_to_work",
    "B08301_021E": "worked_from_home",

    # --- Employment status, 16+ (B23025) ----------------------------------
    # NOTE: the 16+ denominator includes retirees, so LFP/EPOP built on this
    # partly measures age structure — a tract with many 65+ residents looks
    # like it has an employment problem when it just has an age profile.
    # Prefer the prime-age (25-54) versions built from B23001 in COLUMN_GROUPS.
    "B23025_001E": "pop_16plus",
    "B23025_002E": "in_labor_force",
    "B23025_003E": "civ_labor_force",
    "B23025_004E": "employed",
    "B23025_005E": "unemployed",
    "B23025_007E": "not_in_labor_force",

    # --- Class of worker (B24080) -----------------------------------------
    "B24080_001E": "civ_employed_total",

    # --- Poverty (B17024) --------------------------------------------------
    # Universe: population for whom poverty status is determined — same as
    # C17002, so poverty_universe is unchanged from the old C17002_001E.
    "B17024_001E": "poverty_universe",

    # --- Public assistance (B19058) ---------------------------------------
    "B19058_001E": "assistance_hh_universe",
    "B19058_002E": "hh_snap_or_pubassist",

    # --- Income level / spread (medians — see JAM_VALUE_FLOOR) ------------
    "B19013_001E": "median_hh_income",
    "B19083_001E": "gini_index",

    # --- Educational attainment (B15003) ----------------------------------
    # Adult attainment, not school quality — this is a stock measure of the
    # people who live in the tract now, so neither of the objections that
    # pulled SEDA out (priced into housing values, catchment geography)
    # applies. See COLUMN_GROUPS for the rollups.
    "B15003_001E": "pop_25plus",

    # --- Internet (B28002) -------------------------------------------------
    "B28002_001E": "internet_hh_universe",
    "B28002_004E": "hh_broadband",
    "B28002_013E": "hh_no_internet",

    # --- Language (C16002) -------------------------------------------------
    "C16002_001E": "language_hh_universe",

    # --- Family composition (B11003) ---------------------------------------
    # Universe is FAMILIES, not households — a person living alone or a set of
    # roommates is a household but not a family, so families_total is well
    # below total_households and the two must not be mixed in one rate.
    # "Own children" means the householder's own children under 18; a tract's
    # grandparent- or foster-headed families land in the "no own children"
    # lines, so this undercounts households actually raising kids.
    "B11003_001E": "families_total",
    "B11003_002E": "married_couple_fam",
    "B11003_003E": "married_fam_w_children",
    "B11003_008E": "other_family",
    "B11003_009E": "male_hh_no_spouse",
    "B11003_010E": "male_fam_w_children",
    "B11003_015E": "female_hh_no_spouse",
    "B11003_016E": "female_fam_w_children",

    # --- Denominators / screening counts -----------------------------------
    "B01001_001E": "total_population",
    "B11001_001E": "total_households",
    "B26001_001E": "population_gq",
}

# ---------------------------------------------------------------------------
# 2b. Column groups — {output field name: [ACS line codes to sum]}
# ---------------------------------------------------------------------------
# For indicators that are a sum of many lines. Keeps the attribute table
# readable: prime-age employment off B23001 would otherwise be 40 separate
# fields you'd never look at one at a time.

# B17024 is 10 age groups (under 6, 6-11, 12-17, 18-24, 25-34, 35-44, 45-54,
# 55-64, 65-74, 75+), each a 13-line block: an age subtotal, then 12 ratio
# bins. Blocks start at lines 002, 015, 028, ... 119. Within a block:
#   +1  under .50     +5  1.25-1.49    +9  2.00-2.99
#   +2  .50-.74       +6  1.50-1.74    +10 3.00-3.99
#   +3  .75-.99       +7  1.75-1.84    +11 4.00-4.99
#   +4  1.00-1.24     +8  1.85-1.99    +12 5.00 and over
# The first three blocks (002, 015, 028) are children under 18.
B17024_AGE_BLOCKS = range(2, 120, 13)

COLUMN_GROUPS = {
    # --- Prime-age (25-54) employment, from B23001 ------------------------
    # Four age blocks x two sexes. Male 25-29 / 30-34 / 35-44 / 45-54 blocks
    # start at lines 024 / 031 / 038 / 045; the female blocks are the same
    # offsets +86. Within each block: +0 total, +1 in labor force,
    # +3 civilian labor force, +4 employed, +5 unemployed.
    "prime_age_pop": [
        "B23001_024E", "B23001_031E", "B23001_038E", "B23001_045E",
        "B23001_110E", "B23001_117E", "B23001_124E", "B23001_131E",
    ],
    "prime_age_in_lf": [
        "B23001_025E", "B23001_032E", "B23001_039E", "B23001_046E",
        "B23001_111E", "B23001_118E", "B23001_125E", "B23001_132E",
    ],
    "prime_age_civ_lf": [
        "B23001_027E", "B23001_034E", "B23001_041E", "B23001_048E",
        "B23001_113E", "B23001_120E", "B23001_127E", "B23001_134E",
    ],
    "prime_age_employed": [
        "B23001_028E", "B23001_035E", "B23001_042E", "B23001_049E",
        "B23001_114E", "B23001_121E", "B23001_128E", "B23001_135E",
    ],
    "prime_age_unemployed": [
        "B23001_029E", "B23001_036E", "B23001_043E", "B23001_050E",
        "B23001_115E", "B23001_122E", "B23001_129E", "B23001_136E",
    ],

    # --- Self-employment (B24080), incorporated + unincorporated ----------
    "self_employed": ["B24080_005E", "B24080_010E", "B24080_015E", "B24080_020E"],

    # --- Low-income cost burden (B25106) ----------------------------------
    # Households under $35k, and the subset of them paying 30%+ of income.
    "lowinc_hh": ["B25106_003E", "B25106_007E", "B25106_025E", "B25106_029E"],
    "lowinc_cost_burdened": ["B25106_006E", "B25106_010E", "B25106_028E", "B25106_032E"],

    # --- Overcrowding (B25014), owner + renter ----------------------------
    "overcrowded_hh": [  # more than 1.0 occupants per room
        "B25014_005E", "B25014_006E", "B25014_007E",
        "B25014_011E", "B25014_012E", "B25014_013E",
    ],
    "severe_overcrowded_hh": [  # more than 1.5 occupants per room
        "B25014_006E", "B25014_007E", "B25014_012E", "B25014_013E",
    ],

    # --- Recent renter churn (B25038) -------------------------------------
    "renter_moved_since_2020": ["B25038_010E", "B25038_011E"],

    # --- Long tenure / continuity (B25038) --------------------------------
    # Households in place 10+ years: the "moved in 2000-2009", "1990-1999" and
    # "1989 or earlier" lines (006-008 owner, 013-015 renter).
    #
    # Why 2009 is the cut: the buckets in the 2024 release are 2023+,
    # 2020-2022, 2010-2019, 2000-2009, 1990-1999, pre-1990. "2010-2019"
    # straddles the 10-year mark and can't be split, so 2009-or-earlier is the
    # nearest clean boundary. It's conservative rather than approximate — this
    # release pools 2020-2024 interviews, so the *shortest* possible tenure in
    # these lines is 11 years (moved 2009, interviewed 2020). Nobody under 10
    # years leaks in; some 10-to-14-year households are left out.
    #
    # NOTE: this is a PROTECTIVE measure — high is good, the opposite direction
    # from every other rate in this dimension. Reverse it in the ArcGIS index
    # tool (or it will read continuity as instability).
    #
    # Caveat: long tenure is continuity, not always by choice. It also picks up
    # older owners aging in place and renters who can't afford to move, so it
    # correlates with age structure.
    #
    # Unlike the churn rates above, the renter-only cut is NOT the one to
    # prefer here. Long-tenure renting is rare — 7.7% metro-wide against 44.5%
    # for owners — so pct_renter_in_place_10yr piles up against zero (100 of
    # 529 tracts sit at exactly 0%, the mirror of the saturation problem noted
    # under pct_lowinc_cost_burden) and can't separate the low end. Use
    # pct_hh_in_place_10yr for the index; it spreads cleanly (10th-90th
    # percentile 16% to 46%).
    "owner_in_place_10yr":  ["B25038_006E", "B25038_007E", "B25038_008E"],
    "renter_in_place_10yr": ["B25038_013E", "B25038_014E", "B25038_015E"],
    "hh_in_place_10yr": [
        "B25038_006E", "B25038_007E", "B25038_008E",
        "B25038_013E", "B25038_014E", "B25038_015E",
    ],

    # --- Poverty (B17024) --------------------------------------------------
    # Summed across all 10 age blocks (see B17024_AGE_BLOCKS above), these
    # rebuild C17002's bins exactly, so the estimates match the old C17002
    # fields:
    #   below 100% = under .50 + .50-.74 + .75-.99            (offsets +1..+3)
    #   below 200% = everything under 2.00                    (offsets +1..+8)
    "below_poverty": [
        f"B17024_{b + o:03d}E" for b in B17024_AGE_BLOCKS for o in range(1, 4)
    ],
    "below_200_poverty": [
        f"B17024_{b + o:03d}E" for b in B17024_AGE_BLOCKS for o in range(1, 9)
    ],

    # --- Educational attainment (B15003) ----------------------------------
    "no_hs_diploma": [f"B15003_{n:03d}E" for n in range(2, 17)],
    "hs_diploma_or_ged": ["B15003_017E", "B15003_018E"],
    "some_college_or_assoc": ["B15003_019E", "B15003_020E", "B15003_021E"],
    "bachelors_plus": ["B15003_022E", "B15003_023E", "B15003_024E", "B15003_025E"],

    # --- Limited English speaking households (C16002) ---------------------
    "limited_english_hh": ["C16002_004E", "C16002_007E", "C16002_010E", "C16002_013E"],

    # --- Family composition (B11003) --------------------------------------
    # Married-couple, male-householder and female-householder branches each
    # split "with own children" into under-6-only / both / 6-to-17-only, so
    # every rollup below is a sum across those three lines per branch.
    "families_w_children": ["B11003_003E", "B11003_010E", "B11003_016E"],
    # One-parent families with own children under 18 — lines 010 + 016 are the
    # male- and female-householder "with own children" totals.
    "single_parent_families": ["B11003_010E", "B11003_016E"],
    "single_mother_families": ["B11003_016E"],
    # Any own child under 6 (the "under 6 only" and "under 6 and 6 to 17"
    # lines, skipping "6 to 17 only"). Childcare-age kids constrain work hours
    # and moves in a way school-age kids don't.
    "families_w_child_under6": [
        "B11003_004E", "B11003_005E",
        "B11003_011E", "B11003_012E",
        "B11003_017E", "B11003_018E",
    ],
    "single_parent_child_under6": [
        "B11003_011E", "B11003_012E", "B11003_017E", "B11003_018E",
    ],
}

# Keep every downloaded column, not just the renamed/grouped ones. Useful when
# you're still deciding which lines matter; the extras keep their raw codes.
KEEP_UNNAMED_COLUMNS = False

# Also pull margin-of-error columns (the _M lines) alongside the estimates.
INCLUDE_MOE = False

# ACS substitutes large negative "jam values" (-666666666 and friends) for an
# estimate it can't publish — almost always in median columns where the tract
# sample is too thin. Left alone they'd sail into the index tool as the extreme
# low end of the scale. Anything at or below this floor becomes null.
JAM_VALUE_FLOOR = -1e8

# ---------------------------------------------------------------------------
# 3. Rates — {output field: (numerator fields, denominator fields)}
# ---------------------------------------------------------------------------
# Counts are useless to the composite index tool (a big tract just has bigger
# numbers), so anything that should feed the index needs to be a share. Each
# entry sums the numerator fields, sums the denominator fields, and divides.
# Names refer to the *renamed / grouped* fields above. Set RATES = {} to skip.
#
# Medians and the Gini index (median_hh_income, median_gross_rent,
# median_home_value, median_year_built, gini_index) are already scale-free and
# pass straight through — they need no rate.

RATES = {
    # --- Housing cost -----------------------------------------------------
    "pct_cost_burden": (
        ["rent_30_34", "rent_35_39", "rent_40_49", "rent_50_plus",
         "own_mtg_30_34", "own_mtg_35_39", "own_mtg_40_49", "own_mtg_50_plus",
         "own_nomtg_30_34", "own_nomtg_35_39", "own_nomtg_40_49", "own_nomtg_50_plus"],
        ["renter_hh", "owner_hh"],
    ),
    "pct_rent_burden": (
        ["rent_30_34", "rent_35_39", "rent_40_49", "rent_50_plus"],
        ["renter_hh"],
    ),
    "pct_severe_cost_burden": (
        ["rent_50_plus", "own_mtg_50_plus", "own_nomtg_50_plus"],
        ["renter_hh", "owner_hh"],
    ),
    # Two ways to read low-income cost burden, and they answer different
    # questions — they correlate at only r=0.12 across the metro.
    #   pct_lowinc_cost_burden — of households under $35k, the share paying
    #     30%+. "How hard is it to be poor here?" Saturates: metro-wide 84%,
    #     and 113 of 533 tracts sit at exactly 100%, so it barely separates
    #     the tracts you care most about. Good for context, weak as an index
    #     input.
    #   pct_hh_lowinc_burdened — of ALL households, the share that are both
    #     under $35k and paying 30%+. "How much of this tract is in that
    #     situation?" Spreads properly, so prefer this one for the index.
    "pct_lowinc_cost_burden": (
        ["lowinc_cost_burdened"],
        ["lowinc_hh"],
    ),
    "pct_hh_lowinc_burdened": (
        ["lowinc_cost_burdened"],
        ["costinc_hh_total"],
    ),

    # --- Housing stock / conditions ---------------------------------------
    "pct_renter_occupied": (
        ["renter_occupied"],
        ["owner_occupied", "renter_occupied"],
    ),
    "pct_vacant": (
        ["hu_vacant"],
        ["housing_units"],
    ),
    "pct_vacant_other": (
        ["vacant_other"],
        ["housing_units"],
    ),
    "pct_overcrowded": (
        ["overcrowded_hh"],
        ["occupied_hh"],
    ),
    "pct_severe_overcrowded": (
        ["severe_overcrowded_hh"],
        ["occupied_hh"],
    ),

    # --- Residential churn ------------------------------------------------
    "pct_renter_moved_recent": (
        ["renter_moved_2023plus"],
        ["renter_hh_tenure"],
    ),
    "pct_renter_moved_5yr": (
        ["renter_moved_since_2020"],
        ["renter_hh_tenure"],
    ),
    # Long tenure — protective, so REVERSE these in the index tool. See the
    # COLUMN_GROUPS note for what "10+ years" means and why the combined rate
    # is the one to feed the index.
    "pct_hh_in_place_10yr": (
        ["hh_in_place_10yr"],
        ["owner_hh_tenure", "renter_hh_tenure"],
    ),
    "pct_renter_in_place_10yr": (
        ["renter_in_place_10yr"],
        ["renter_hh_tenure"],
    ),
    "pct_owner_in_place_10yr": (
        ["owner_in_place_10yr"],
        ["owner_hh_tenure"],
    ),
    "pct_moved_last_year": (
        ["moved_within_county", "moved_diff_county", "moved_diff_state", "moved_from_abroad"],
        ["mobility_universe"],
    ),
    # Shortened from pct_moved_last_year_within_county — that was 33 chars and
    # a file geodatabase truncates field names at 31.
    "pct_moved_within_county": (
        ["moved_within_county"],
        ["mobility_universe"],
    ),

    # --- Transportation ---------------------------------------------------
    "pct_no_vehicle": (
        ["owner_no_vehicle", "renter_no_vehicle"],
        ["occupied_hh"],
    ),
    "pct_commute_gt45": (
        ["commute_45_59", "commute_60_89", "commute_90_plus"],
        ["workers_16plus"],
    ),
    "pct_commute_gt15": (
        ["commute_15_19", "commute_20_24", "commute_25_29", "commute_30_34", "commute_35_39", "commute_40_44", "commute_45_59", "commute_60_89", "commute_90_plus"],
        ["workers_16plus"],
    ),
    "pct_public_transit": (
        ["public_transit"],
        ["workers_16plus"],
    ),
    "pct_worked_from_home": (
        ["worked_from_home"],
        ["workers_16plus"],
    ),

    # --- Employment, 16+ (age-structure sensitive — see note in COLUMNS) --
    "pct_unemployed": (
        ["unemployed"],
        ["civ_labor_force"],
    ),
    "pct_labor_force_part": (
        ["in_labor_force"],
        ["pop_16plus"],
    ),
    "pct_emp_pop_ratio": (
        ["employed"],
        ["pop_16plus"],
    ),

    # --- Employment, prime age 25-54 (preferred) --------------------------
    "pct_prime_unemployed": (
        ["prime_age_unemployed"],
        ["prime_age_civ_lf"],
    ),
    "pct_prime_lfp": (
        ["prime_age_in_lf"],
        ["prime_age_pop"],
    ),
    "pct_prime_epop": (
        ["prime_age_employed"],
        ["prime_age_pop"],
    ),
    "pct_self_employed": (
        ["self_employed"],
        ["civ_employed_total"],
    ),

    # --- Economic security ------------------------------------------------
    "pct_below_poverty": (
        ["below_poverty"],
        ["poverty_universe"],
    ),
    "pct_below_200_poverty": (
        ["below_200_poverty"],
        ["poverty_universe"],
    ),
    "pct_snap_or_pubassist": (
        ["hh_snap_or_pubassist"],
        ["assistance_hh_universe"],
    ),

    # --- Family composition -----------------------------------------------
    # Two denominators, two different questions — same split as the low-income
    # cost burden pair above.
    #   pct_single_parent_fam — of families WITH children, the share with one
    #     parent. The conventional measure, but it's undefined-ish in tracts
    #     with few families raising kids and says nothing about how many
    #     children live there.
    #   pct_fam_single_parent — of ALL families, the share that are one parent
    #     with own children. Composition of the tract rather than a conditional
    #     probability; prefer this one for the index.
    "pct_families_w_children": (
        ["families_w_children"],
        ["families_total"],
    ),
    "pct_single_parent_fam": (
        ["single_parent_families"],
        ["families_w_children"],
    ),
    "pct_fam_single_parent": (
        ["single_parent_families"],
        ["families_total"],
    ),
    "pct_single_mother_fam": (
        ["single_mother_families"],
        ["families_total"],
    ),
    "pct_fam_child_under6": (
        ["families_w_child_under6"],
        ["families_total"],
    ),
    # One parent, at least one child under 6 — the tightest version of the
    # childcare-constraint signal.
    "pct_fam_single_parent_u6": (
        ["single_parent_child_under6"],
        ["families_total"],
    ),
    # Families are a subset of households, so this is a share of households,
    # not of families — it's the one that's comparable to the household-based
    # rates elsewhere in the table.
    "pct_hh_single_parent": (
        ["single_parent_families"],
        ["total_households"],
    ),

    # --- Human capital / access -------------------------------------------
    "pct_no_hs_diploma": (
        ["no_hs_diploma"],
        ["pop_25plus"],
    ),
    "pct_bachelors_plus": (
        ["bachelors_plus"],
        ["pop_25plus"],
    ),
    "pct_no_internet": (
        ["hh_no_internet"],
        ["internet_hh_universe"],
    ),
    "pct_broadband": (
        ["hh_broadband"],
        ["internet_hh_universe"],
    ),
    "pct_limited_english": (
        ["limited_english_hh"],
        ["language_hh_universe"],
    ),
}

# Express rates as 0–100 instead of 0–1.
RATES_AS_PERCENT = True

# ---------------------------------------------------------------------------
# 4. Small-sample screen
# ---------------------------------------------------------------------------
# Adds an "exclude" yes/no field so tiny-population tracts can be filtered out
# in ArcGIS before the index is calculated — a tract with a handful of
# households swings to 0% or 100% on any rate and distorts the map. Same
# thresholds as the deck (<50 persons, <50 households, >=40% group quarters).
# Set SCREEN = None to drop the field.

SCREEN = {
    "min_population": 50,
    "min_households": 50,
    "max_gq_pct": 40,
    "population_field": "total_population",
    "households_field": "total_households",
    "gq_field": "population_gq",
}

# ---------------------------------------------------------------------------
# 5. Eviction filing rate (not ACS)
# ---------------------------------------------------------------------------
# Adds one field, pct_evict_filing_rate: eviction filings per year per 100
# renter-occupied households. Set EVICTION_PATH = None to skip it.
#
# Numerator is Eviction Lab's annual tract-proprietary filing counts; the
# denominator is renter_occupied (ACS B25003_003E), already built above.
#
# Note the vintage mismatch this creates: the filings are 2014-2018 while
# renter_occupied is the ACS 2020-2024 5-year estimate. The rate is therefore
# "historical filings against today's renter base", which is the intended
# reading here — it asks how exposed the current renter population is, not what
# the rate literally was in 2016.
#
# Why this file and not the monthly "_tracts2020" one, which would need no
# crosswalk at all: that file is missing Johnson County KS entirely (verified
# against the full national file — 2.7M rows, zero for 20091, in any year), has
# no 2018 for any county, and its court coverage is ragged enough that
# Wyandotte would rest on 2016 alone. This file covers all six counties for all
# five years. Where both files overlap they agree within ~4%, so this is a
# coverage choice, not an accuracy one.
#
# Two properties of the source drive the method:
#
# 1. Suppression, not zeros. Eviction Lab drops low-count/unvalidated cells
#    rather than reporting them as zero, so a null `filings` is "not observed"
#    and must not be read as no evictions. Each 2010 tract's filings are
#    therefore averaged over the years it actually reports (415 of 483 local
#    tracts report all five; 472 report at least one; 11 report none).
#
# 2. Geography. This file is 2010 tract vintage and everything else here is
#    2020, so filings are apportioned across the 2020 tracts each 2010 tract
#    overlaps, using the Census Bureau's 2020 tract relationship file
#    (downloaded and cached on first run). 77% of local 2010 tracts map 1:1, so
#    the weighting only bites on the remaining quarter.
#
#    The weight is renter-based rather than area-based: each candidate 2020
#    tract contributes its own ACS renter count scaled by how much of it lies
#    inside the 2010 tract. Straight land area would misallocate wherever a
#    tract splits into unequal halves — a dense block and a park or industrial
#    strip — which is exactly where filings are least uniform. Where a 2010
#    tract overlaps no renter households at all, it falls back to land area so
#    the filings aren't silently dropped.
#
# Three guards, all of which null the rate rather than dropping the tract:
#
# EVICTION_MIN_RENTER_HH — minimum denominator. The SCREEN section below can't
#   do this job: it keys on total population and households, so a tract with
#   1,700 households of which 5 are renters passes the screen while producing a
#   70% filing rate off 7 filings. Tracts under 25 renter households ran a
#   median rate of ~21% against ~6% metro-wide — noise, not signal, and left in
#   it would anchor the top of the index's scale.
#
# EVICTION_MIN_COVERAGE — minimum share of a 2020 tract's land area that comes
#   from 2010 tracts with usable data. Stops a tract being scored off a corner
#   of itself when its main parent was suppressed.
#
# EVICTION_MIN_YEARS — minimum reporting years for a 2010 tract to be used.

EVICTION_PATH   = DATA_DIR / "Eviction" / "moks_tract_proprietary_2000_2018.csv"
EVICTION_YEARS  = range(2014, 2019)  # 2014-2018 inclusive
EVICTION_FIELD  = "pct_evict_filing_rate"
EVICTION_DENOM  = "renter_occupied"  # an ACS field built above
EVICTION_MIN_RENTER_HH = 25
EVICTION_MIN_COVERAGE  = 0.5
EVICTION_MIN_YEARS     = 1
EVICTION_KEEP_COUNTS   = False

# 2010->2020 tract relationship files (Census Bureau, one per state). Cached in
# EVICTION_REL_DIR after the first download.
EVICTION_REL_DIR = DATA_DIR / "Eviction"
EVICTION_REL_URL = ("https://www2.census.gov/geo/docs/maps-data/data/rel2020/tract/"
                    "tab20_tract20_tract10_st{state}.txt")

# ---------------------------------------------------------------------------
# 6. ZCTAs (ZIP Code Tabulation Areas)
# ---------------------------------------------------------------------------
# The ZCTA set is whatever features are in ZCTA_GEOJSON_PATH (built by the
# explorer repo's prep_zcta.py: ZIPs touching the six counties). ZCTAs cross
# county lines, so they can't be filtered by county FIPS the way tracts are.
#
# Everything in sections 2-4 applies to ZCTAs as-is. The eviction rate
# (section 5) does not: it's apportioned from 2010 tracts, and there's no ZCTA
# equivalent of that crosswalk here, so ZCTAs don't get that field. Nor do
# they get the Mobility Category, which is built from the tract table in
# ArcGIS Pro, not by this script.
#
# Each feature's properties are replaced with {"ZIP": ..., <every field>}, so
# rerunning prep_zcta.py (which rewrites the file with ZIP only) means
# rerunning this script afterwards. Set ZCTA_GEOJSON_PATH = None to skip ZCTAs.

ZCTA_GEOJSON_PATH = Path(r"C:/Code/stability-tract-explorer/src/assets/zcta_kc.geojson")

# Decimal places kept on non-integer values in the GeoJSON, to keep the file
# the app downloads small. The CSV keeps full precision.
ZCTA_JSON_DECIMALS = 3

# ===========================================================================
# Download / assemble
# ===========================================================================

ACS_BASE_URL  = f"https://www2.census.gov/programs-surveys/acs/summary_file/{ACS_YEAR}/table-based-SF/data/5YRData/"
ACS_SHELL_URL = f"https://www2.census.gov/programs-surveys/acs/summary_file/{ACS_YEAR}/table-based-SF/documentation/ACS{ACS_YEAR}5YR_Table_Shells.txt"

TRACT_PREFIX = "1400000US"
ZCTA_PREFIX  = "860Z200US"


def normalize_var(code):
    """Any of B25070_001E / B25070_E001 / B25070_001 -> B25070_E001."""
    code = str(code).strip().upper()
    m = re.fullmatch(r"([A-Z0-9]+?)_([EM]?)(\d{3})([EM]?)", code)
    if not m:
        raise ValueError(f"Unrecognized ACS variable code: {code!r}")
    table, pre, line, post = m.groups()
    kind = pre or post or "E"
    return f"{table}_{kind}{line}"


def table_of(dat_col):
    return dat_col.split("_")[0]


def load_shells():
    """Table shells for ACS_TABLES, keyed by summary-file column name."""
    logger.info("Loading ACS table shells...")
    shells = pd.read_csv(ACS_SHELL_URL, sep="|", low_memory=False)
    shells = shells[shells["Line"].notna()].rename(columns={
        "Table ID": "table_id",
        "Indent": "indent",
        "Unique ID": "var",
        "Label": "label",
        "Title": "table_title",
        "Universe": "universe",
    })
    shells = shells[shells["table_id"].isin(ACS_TABLES)].copy()
    shells["dat_col"] = shells["var"].apply(normalize_var)
    return shells[["table_id", "dat_col", "var", "table_title", "universe", "indent", "label"]]


def download_acs_dat(table_id):
    file_name = f"acsdt5y{ACS_YEAR}-{table_id.lower()}.dat"
    url = ACS_BASE_URL + file_name
    r = requests.get(url, stream=True)
    if r.status_code != 200:
        logger.warning(f"Skipping {table_id} (HTTP {r.status_code} for {url})")
        return None
    total = int(r.headers.get("content-length", 0))
    buf = BytesIO()
    with tqdm(total=total, unit="B", unit_scale=True, unit_divisor=1024,
              desc=f"  {file_name}", leave=False) as bar:
        for chunk in r.iter_content(chunk_size=65536):
            buf.write(chunk)
            bar.update(len(chunk))
    buf.seek(0)
    return buf


def process_acs_dat(file_obj, table_id):
    """All rows, GEO_ID + estimate (and optionally MOE) columns."""
    df = pd.read_csv(file_obj, sep="|", low_memory=False)
    kinds = ("_E", "_M") if INCLUDE_MOE else ("_E",)
    value_cols = [c for c in df.columns if c.startswith(tuple(table_id + k for k in kinds))]
    return df[["GEO_ID"] + value_cols]


def rows_for(df, prefix):
    """Rows of one summary level (tract, ZCTA), GEO_ID's prefix stripped into GEOID."""
    out = df[df["GEO_ID"].str.startswith(prefix)].copy()
    out.insert(0, "GEOID", out.pop("GEO_ID").str[len(prefix):])
    return out


def filter_to_counties(df):
    prefixes = tuple(c["state"] + c["county"] for c in COUNTIES.values())
    return df[df["GEOID"].str.startswith(prefixes)].copy()


def merge_frames(frames):
    merged = frames[0]
    for frame in frames[1:]:
        merged = merged.merge(frame, on="GEOID", how="outer")
    return merged


def download_tables(zctas=None):
    """Tract frame, plus a ZCTA frame for the `zctas` GEOIDs (None if not asked for).

    Both come out of the same per-table download — each .dat file carries every
    summary level — so ZCTAs cost no extra requests.
    """
    tract_frames, zcta_frames = [], []
    for table in tqdm(ACS_TABLES, desc="ACS tables", unit="table"):
        buf = download_acs_dat(table)
        if buf is None:
            continue
        rows = process_acs_dat(buf, table)
        tract_frames.append(filter_to_counties(rows_for(rows, TRACT_PREFIX)))
        if zctas:
            z = rows_for(rows, ZCTA_PREFIX)
            zcta_frames.append(z[z["GEOID"].isin(zctas)])
    if not tract_frames:
        raise RuntimeError("No ACS tables downloaded — check ACS_TABLES and ACS_YEAR.")

    tracts = merge_frames(tract_frames)
    logger.info(f"Downloaded {len(tracts):,} tracts x {len(tracts.columns) - 1:,} ACS columns")

    zcta_df = None
    if zcta_frames:
        zcta_df = merge_frames(zcta_frames)
        logger.info(f"Downloaded {len(zcta_df):,} ZCTAs x {len(zcta_df.columns) - 1:,} ACS columns")
        missing = sorted(set(zctas) - set(zcta_df["GEOID"]))
        if missing:
            logger.warning(f"{len(missing)} ZCTA(s) in the GeoJSON have no ACS rows: {', '.join(missing)}")
    return tracts, zcta_df


def clear_jam_values(df):
    """Null out ACS jam values so they can't be read as real estimates."""
    values = df.drop(columns=["GEOID"]).apply(pd.to_numeric, errors="coerce")
    jam = values <= JAM_VALUE_FLOOR
    n_jam = int(jam.to_numpy().sum())
    if n_jam:
        affected = sorted(jam.columns[jam.any()])
        logger.info(f"Nulled {n_jam:,} jam value(s) in {len(affected)} column(s): {', '.join(affected)}")
        values = values.mask(jam)
    return pd.concat([df[["GEOID"]], values], axis=1)


# ===========================================================================
# Rename / group / derive
# ===========================================================================

ARCGIS_FIELD_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")


def check_field_names(names):
    for name in names:
        if not ARCGIS_FIELD_RE.match(name):
            logger.warning(f"Field name '{name}' isn't ArcGIS-safe (letters/digits/underscore, must not start with a digit)")
        elif len(name) > 31:
            logger.warning(f"Field name '{name}' is {len(name)} chars — will be truncated if exported to a file geodatabase")


def _resolve(code, name, df, known, kind):
    """Normalize one config line code, or None if it isn't usable."""
    dat_col = normalize_var(code)
    if table_of(dat_col) not in ACS_TABLES:
        logger.warning(f"{kind} '{name}': table {table_of(dat_col)} ({code}) isn't in ACS_TABLES; skipped")
        return None
    if dat_col not in known:
        logger.warning(f"{kind} '{name}': {code} is not a line in the {ACS_YEAR} table shells; skipped")
        return None
    if dat_col not in df.columns:
        logger.warning(f"{kind} '{name}': {code} is not present in the downloaded data; skipped")
        return None
    return dat_col


def build_fields(df, shells):
    """Apply COLUMNS renames and COLUMN_GROUPS sums against the raw frame."""
    known = set(shells["dat_col"])
    fields, claimed = {}, {}

    for code, name in COLUMNS.items():
        dat_col = _resolve(code, name, df, known, "COLUMNS entry")
        if dat_col is None:
            continue
        if name in claimed:
            raise ValueError(f"Duplicate output field name '{name}' ({code} and {claimed[name]})")
        claimed[name] = code
        fields[name] = df[dat_col]

    n_renamed = len(fields)

    for name, codes in COLUMN_GROUPS.items():
        dat_cols = [c for c in (_resolve(code, name, df, known, "COLUMN_GROUPS entry") for code in codes) if c]
        if not dat_cols:
            logger.warning(f"COLUMN_GROUPS entry '{name}': no usable columns; skipped")
            continue
        if len(dat_cols) != len(codes):
            logger.warning(f"COLUMN_GROUPS entry '{name}': summing {len(dat_cols)} of {len(codes)} requested line(s)")
        if name in claimed:
            raise ValueError(f"Duplicate output field name '{name}' (COLUMN_GROUPS and {claimed[name]})")
        claimed[name] = "COLUMN_GROUPS"
        fields[name] = df[dat_cols].sum(axis=1)

    n_grouped = len(fields) - n_renamed

    parts = [df[["GEOID"]], pd.DataFrame(fields, index=df.index)]
    if KEEP_UNNAMED_COLUMNS:
        used = set(claimed.values()) | {c for codes in COLUMN_GROUPS.values() for c in map(normalize_var, codes)}
        parts.append(df[[c for c in df.columns if c != "GEOID" and c not in used]])

    out = pd.concat(parts, axis=1)
    logger.info(f"Built {n_renamed} renamed + {n_grouped} grouped = {len(out.columns) - 1} field(s)")
    check_field_names([c for c in out.columns if c != "GEOID"])
    return out


def add_rates(df):
    scale = 100 if RATES_AS_PERCENT else 1
    rates = {}
    for name, (num_cols, den_cols) in RATES.items():
        missing = [c for c in list(num_cols) + list(den_cols) if c not in df.columns]
        if missing:
            logger.warning(f"Rate '{name}': missing field(s) {missing}; skipped")
            continue
        num = df[list(num_cols)].sum(axis=1)
        den = df[list(den_cols)].sum(axis=1)
        rates[name] = num / den.where(den > 0) * scale
    logger.info(f"  {len(rates)} of {len(RATES)} rate(s) computed")
    check_field_names(list(rates))
    return pd.concat([df, pd.DataFrame(rates, index=df.index)], axis=1)


def add_screen(df, unit="tract"):
    if SCREEN is None:
        return df

    fields = [SCREEN["population_field"], SCREEN["households_field"], SCREEN["gq_field"]]
    missing = [f for f in fields if f not in df.columns]
    if missing:
        logger.warning(f"Small-sample screen: missing field(s) {missing}; 'exclude' not added")
        return df

    pop, hh, gq = (df[f] for f in fields)
    excluded = (
        (gq / pop.where(pop > 0) * 100 > SCREEN["max_gq_pct"])
        | (pop < SCREEN["min_population"])
        | (hh < SCREEN["min_households"])
    )
    df = df.assign(exclude=excluded.map({True: "yes", False: "no"}))
    logger.info(f"  {excluded.sum():,} of {len(df):,} {unit}(s) flagged exclude='yes'")
    return df


# ===========================================================================
# Eviction filing rate — see section 5 for the method
# ===========================================================================

def load_tract_relationship(counties):
    """2010->2020 tract overlaps for the study states, cached after first use."""
    frames = []
    for state in sorted({c["state"] for c in COUNTIES.values()}):
        path = EVICTION_REL_DIR / f"tab20_tract20_tract10_st{state}.txt"
        if not path.exists():
            url = EVICTION_REL_URL.format(state=state)
            logger.info(f"  Downloading tract relationship file for state {state}...")
            response = requests.get(url, timeout=120)
            response.raise_for_status()
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(response.content)
        frames.append(pd.read_csv(
            path, sep="|", dtype=str, encoding="utf-8-sig",
            usecols=["GEOID_TRACT_20", "GEOID_TRACT_10", "AREALAND_PART"],
        ))

    rel = pd.concat(frames, ignore_index=True)
    rel["AREALAND_PART"] = pd.to_numeric(rel["AREALAND_PART"], errors="coerce").fillna(0)
    rel = rel[rel["GEOID_TRACT_10"].str[:5].isin(counties)]

    # Share of each 2020 tract that falls inside a given 2010 tract. Doubles as
    # the data-coverage measure below, so it's computed before any filtering on
    # which 2010 tracts actually reported.
    area20 = rel.groupby("GEOID_TRACT_20")["AREALAND_PART"].transform("sum")
    rel["share_of_2020"] = rel["AREALAND_PART"] / area20.where(area20 > 0)
    logger.info(f"  {rel['GEOID_TRACT_10'].nunique():,} 2010 tract(s) -> "
                f"{rel['GEOID_TRACT_20'].nunique():,} 2020 tract(s)")
    return rel


def renter_weights(rel, renters):
    """Split each 2010 tract's filings across the 2020 tracts it overlaps.

    A 2020 tract's claim on the filings is its own renter count scaled by how
    much of it sits inside the 2010 tract. Falls back to land area for 2010
    tracts that overlap no renter households, so their filings aren't dropped.
    """
    rel = rel.copy()
    rel["renters_part"] = rel["GEOID_TRACT_20"].map(renters).fillna(0) * rel["share_of_2020"].fillna(0)

    total_renters = rel.groupby("GEOID_TRACT_10")["renters_part"].transform("sum")
    total_area = rel.groupby("GEOID_TRACT_10")["AREALAND_PART"].transform("sum")
    area_weight = rel["AREALAND_PART"] / total_area.where(total_area > 0)
    rel["weight"] = (rel["renters_part"] / total_renters.where(total_renters > 0)).fillna(area_weight).fillna(0)

    n_fallback = rel.loc[total_renters <= 0, "GEOID_TRACT_10"].nunique()
    if n_fallback:
        logger.info(f"  {n_fallback:,} 2010 tract(s) overlap no renter households; used land-area weights")
    return rel


def add_eviction_rate(df):
    """Add pct_evict_filing_rate: filings per year per 100 renter households.

    Averages each 2010 tract's filings over the years it reports, apportions
    them onto 2020 tracts renter-weighted, and divides by the ACS renter count
    already in `df`. See section 5 for the reasoning.
    """
    if EVICTION_PATH is None:
        return df

    if not EVICTION_PATH.exists():
        logger.warning(f"Eviction input not found: {EVICTION_PATH}; '{EVICTION_FIELD}' not added")
        return df
    if EVICTION_DENOM not in df.columns:
        logger.warning(f"Eviction denominator '{EVICTION_DENOM}' not in the table; '{EVICTION_FIELD}' not added")
        return df

    logger.info(f"Loading {EVICTION_PATH}...")
    eviction = pd.read_csv(EVICTION_PATH, dtype={"id": str})
    eviction["GEOID_TRACT_10"] = eviction["id"].str.zfill(11)

    counties = {c["state"] + c["county"] for c in COUNTIES.values()}
    window = eviction[eviction["GEOID_TRACT_10"].str[:5].isin(counties)
                      & eviction["year"].isin(EVICTION_YEARS)]
    n_tracts = window["GEOID_TRACT_10"].nunique()

    # A null `filings` is a suppressed cell, not a zero — drop it and average
    # over the years each tract actually reports.
    reported = window[window["filings"].notna()]
    logger.info(f"  {len(reported):,} of {len(window):,} tract-year(s) report filings in "
                f"{min(EVICTION_YEARS)}-{max(EVICTION_YEARS)} ({n_tracts:,} tracts, 2010 geography)")

    per_2010 = reported.groupby("GEOID_TRACT_10").agg(
        filings_sum=("filings", "sum"), years_used=("year", "nunique"))
    per_2010 = per_2010[per_2010["years_used"] >= EVICTION_MIN_YEARS]
    per_2010["annual_filings"] = per_2010["filings_sum"] / per_2010["years_used"]
    dropped = n_tracts - len(per_2010)
    if dropped:
        logger.warning(f"  {dropped:,} 2010 tract(s) had under {EVICTION_MIN_YEARS} reporting year(s) and were dropped")

    logger.info("Apportioning filings from 2010 to 2020 tracts (renter-weighted)...")
    rel = load_tract_relationship(counties)
    rel = renter_weights(rel, df.set_index("GEOID")[EVICTION_DENOM])

    usable = rel[rel["GEOID_TRACT_10"].isin(per_2010.index)].copy()
    usable["allocated"] = usable["GEOID_TRACT_10"].map(per_2010["annual_filings"]) * usable["weight"]
    allocated = usable.groupby("GEOID_TRACT_20")["allocated"].sum()

    # How much of each 2020 tract descends from 2010 tracts that reported.
    coverage = usable.groupby("GEOID_TRACT_20")["share_of_2020"].sum()

    out = df.copy()
    covered = out["GEOID"].map(coverage).fillna(0) >= EVICTION_MIN_COVERAGE
    annual = out["GEOID"].map(allocated).where(covered)

    den = out[EVICTION_DENOM]
    out[EVICTION_FIELD] = annual / den.where(den >= EVICTION_MIN_RENTER_HH) * 100
    if EVICTION_KEEP_COUNTS:
        out["evict_filings"] = annual
        out["evict_coverage"] = out["GEOID"].map(coverage).fillna(0)

    n_null = int(out[EVICTION_FIELD].isna().sum())
    logger.info(f"  {len(out) - n_null:,} of {len(out):,} tract(s) have a rate")
    if n_null:
        thin = int((covered & (den < EVICTION_MIN_RENTER_HH)).sum())
        logger.warning(f"  {n_null:,} tract(s) null: {int((~covered).sum()):,} under "
                       f"{EVICTION_MIN_COVERAGE:.0%} data coverage, {thin:,} with under "
                       f"{EVICTION_MIN_RENTER_HH} renter households")
    check_field_names([EVICTION_FIELD])
    return out


# ===========================================================================
# Geometry / output
# ===========================================================================

def join_geometry(df):
    if TRACT_GDB_PATH is None:
        logger.info("TRACT_GDB_PATH is None — writing a non-spatial table")
        return df

    logger.info(f"Loading tract geometry from {TRACT_GDB_PATH} (layer={TRACT_GDB_LAYER})...")
    tracts = gpd.read_file(TRACT_GDB_PATH, layer=TRACT_GDB_LAYER)[["GEOID", "geometry"]]
    tracts["GEOID"] = tracts["GEOID"].astype(str)

    gdf = gpd.GeoDataFrame(
        df.merge(tracts, on="GEOID", how="left"), geometry="geometry", crs=tracts.crs
    )
    n_missing = gdf["geometry"].isna().sum()
    if n_missing:
        logger.warning(f"{n_missing} tract(s) had no matching geometry in '{TRACT_GDB_LAYER}'")
    return gdf


# ===========================================================================
# ZCTAs — see section 6
# ===========================================================================

def load_zcta_geojson():
    """The app's ZCTA GeoJSON and the set of ZIPs in it, or (None, None) if skipped."""
    if ZCTA_GEOJSON_PATH is None:
        return None, None
    if not ZCTA_GEOJSON_PATH.exists():
        logger.warning(f"ZCTA GeoJSON not found: {ZCTA_GEOJSON_PATH}; ZCTAs skipped")
        return None, None
    geojson = json.loads(ZCTA_GEOJSON_PATH.read_text(encoding="utf-8"))
    zips = {str(f["properties"]["ZIP"]) for f in geojson["features"]}
    logger.info(f"Loaded {len(zips):,} ZCTA(s) from {ZCTA_GEOJSON_PATH.name}")
    return geojson, zips


def json_value(value):
    """A pandas cell as a JSON-safe value: null for NaN, whole numbers as ints."""
    if pd.isna(value):
        return None
    if isinstance(value, str):
        return value
    value = float(value)
    return int(value) if value.is_integer() else round(value, ZCTA_JSON_DECIMALS)


def write_zcta_geojson(geojson, df):
    """Replace each feature's properties with ZIP + every field in `df`, and save."""
    by_zip = df.set_index("GEOID")
    for feature in geojson["features"]:
        zip_code = str(feature["properties"]["ZIP"])
        props = {"ZIP": zip_code}
        if zip_code in by_zip.index:
            row = by_zip.loc[zip_code]
            props.update({field: json_value(row[field]) for field in by_zip.columns})
        feature["properties"] = props

    write_safely(ZCTA_GEOJSON_PATH, lambda p: p.write_text(
        json.dumps(geojson, separators=(",", ":")), encoding="utf-8"))


# Windows lock errors: 5 access denied, 32 sharing violation, 33 lock violation,
# 1224 user-mapped section (what ArcGIS Pro holding a parquet open looks like).
LOCK_WINERRORS = {5, 32, 33, 1224}


def write_safely(path, writer, required=True):
    """Write via `writer(path)`, turning a Windows file lock into a clear message.

    Excel and ArcGIS Pro both hold an open file against writes, so a rerun with
    the previous output still open would otherwise die with an opaque traceback
    partway through the pipeline. Genuine IO errors are re-raised untouched.
    """
    try:
        writer(path)
    except OSError as exc:
        if getattr(exc, "winerror", None) not in LOCK_WINERRORS and not isinstance(exc, PermissionError):
            raise
        msg = (f"Can't write {path.name} — it's open in another program "
               f"(Excel, or ArcGIS Pro holding the layer). Close it and rerun.")
        if required:
            raise RuntimeError(msg) from None
        logger.warning(msg + " Continuing without it.")
        return False
    logger.info(f"Saved: {path}")
    return True


def build():
    DATA_DIR.mkdir(exist_ok=True)
    OUTPUT_DIR.mkdir(exist_ok=True)

    shells = load_shells()
    missing_tables = sorted(set(ACS_TABLES) - set(shells["table_id"]))
    if missing_tables:
        logger.warning(f"Table(s) not found in the {ACS_YEAR} shells: {missing_tables}")

    # Reference only — nothing downstream reads it, so a lock isn't fatal.
    write_safely(DATA_DIR / "column_lookup.csv",
                 lambda p: shells.to_csv(p, index=False), required=False)

    zcta_geojson, zctas = load_zcta_geojson()
    raw, zcta_raw = download_tables(zctas)

    df = build_fields(clear_jam_values(raw), shells)

    logger.info("Computing rates...")
    df = add_rates(df)

    logger.info("Adding eviction filing rate...")
    df = add_eviction_rate(df)

    logger.info("Applying small-sample screen...")
    df = add_screen(df)

    write_safely(OUTPUT_DIR / "acs_tracts.csv",
                 lambda p: df.to_csv(p, index=False), required=False)

    out = join_geometry(df)
    write_safely(OUTPUT_DIR / "acs_tracts.parquet",
                 lambda p: out.to_parquet(p, index=False))
    logger.info(f"  {len(out):,} tracts, {len(out.columns):,} columns")

    zcta_df = None
    if zcta_raw is not None:
        # Same fields, rates, and screen as the tracts; no eviction rate (see
        # section 6).
        logger.info("Building ZCTA fields...")
        zcta_df = build_fields(clear_jam_values(zcta_raw), shells)
        zcta_df = add_screen(add_rates(zcta_df), unit="ZCTA")
        write_safely(OUTPUT_DIR / "acs_zctas.csv",
                     lambda p: zcta_df.to_csv(p, index=False), required=False)
        write_zcta_geojson(zcta_geojson, zcta_df)

    metadata = {
        "run_timestamp": datetime.now().isoformat(),
        "acs_year": ACS_YEAR,
        "acs_period": f"{ACS_YEAR - 4}–{ACS_YEAR}",
        "source": "ACS Summary File (table-based)",
        "counties": list(COUNTIES.keys()),
        "tables": ACS_TABLES,
        "fields": [c for c in out.columns if c != "geometry"],
        "rates": list(RATES),
        "column_groups": COLUMN_GROUPS,
        "screen": SCREEN,
        "eviction": None if EVICTION_PATH is None else {
            "source": "Eviction Lab annual tract-proprietary 2000-2018 (2010 tract geography)",
            "file": EVICTION_PATH.name,
            "years": [min(EVICTION_YEARS), max(EVICTION_YEARS)],
            "field": EVICTION_FIELD,
            "denominator": EVICTION_DENOM,
            "method": ("mean annual filings over reporting years, apportioned 2010->2020 "
                       "renter-weighted via the Census tract relationship file, per 100 "
                       "renter-occupied households"),
            "min_reporting_years": EVICTION_MIN_YEARS,
            "min_area_coverage": EVICTION_MIN_COVERAGE,
            "min_renter_households": EVICTION_MIN_RENTER_HH,
        },
        "tract_rows": len(out),
        "zcta_rows": None if zcta_df is None else len(zcta_df),
        "zcta_geojson": None if zcta_df is None else str(ZCTA_GEOJSON_PATH),
    }
    write_safely(OUTPUT_DIR / "acs_tracts_metadata.json",
                 lambda p: p.write_text(json.dumps(metadata, indent=2)), required=False)
    return out


if __name__ == "__main__":
    try:
        build()
    except RuntimeError as exc:
        # Expected, actionable failures (file locks) — no stack trace needed.
        logger.error(str(exc))
        sys.exit(1)