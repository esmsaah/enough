"""Merge research/verified/plans_verified.csv into src/app/plans.data.json.

Verified rows (official site, App Store, or 2+ news sources) replace whatever the
older research had for that service and country. Single-source rows are skipped.
Run: python3 scripts/build_verified_plans.py
"""
import csv, json, re

ALIASES = {'hbo max': ['hbo max', 'max'], 'icloud+': ['icloud+', 'icloud']}
DEFAULT_ORDER = ['standard', 'individual', 'personal', 'plus', '200gb', '100gb', 'premium', 'basic', 'monthly']

def ptype(service, plan):
    p = plan.lower()
    m = re.match(r'(\d+)\s*(gb|tb)', p)
    if m: return f'{m.group(1)}{m.group(2)}'
    for k in ('student', 'duo', 'family', 'mobile', 'platinum'):
        if k in p: return k
    if 'ads' in p or 'advert' in p: return 'basic_with_ads'
    for k in ('basic', 'standard', 'premium', 'individual', 'personal', 'plus', 'pro', 'go', 'lite'):
        if k in p: return k
    return 'monthly'

def num(s):
    try: return round(float(s), 2) if s not in ('', None) else None
    except ValueError: return None

data = json.load(open('src/app/plans.data.json'))
groups = {}
for r in csv.DictReader(open('research/verified/plans_verified.csv')):
    if r['tier'].startswith('C') or len(r['country']) != 2 or r['country'] in ('EU',): continue
    m = num(r['monthly'])
    if not m: continue
    t = ptype(r['service'], r['plan'])
    people = r.get('streams') or r.get('accounts') or ''
    plan = {'name': r['plan'], 'type': t, 'monthly': m, 'currency': r['currency']}
    if num(r['yearly']): plan['yearly'] = num(r['yearly'])
    if people.isdigit(): plan['people'] = int(people)
    if r['ads'] == 'yes': plan['ads'] = True
    plan['source'] = r['source'].split(' ; ')[0]
    groups.setdefault((r['service'], r['country']), {'checked': r['checked'], 'plans': []})['plans'].append(plan)

replaced = 0
for (service, cc), g in groups.items():
    plans = sorted(g['plans'], key=lambda p: p['monthly'])
    default = next((i for k in DEFAULT_ORDER for i, p in enumerate(plans) if p['type'] == k), 0)
    for key in ALIASES.get(service, [service]):
        data.setdefault(key, {})[cc] = {'checked': g['checked'], 'default': default, 'plans': plans, 'verified': True}
        replaced += 1
json.dump(data, open('src/app/plans.data.json', 'w'), ensure_ascii=False, indent=2)
open('src/app/plans.data.json', 'a').write('\n')
print(replaced, 'service-country entries written;', len(data), 'services')
