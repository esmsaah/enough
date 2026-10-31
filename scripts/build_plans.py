"""Build src/app/plans.data.json from research/plans/*.xlsx (Perplexity plan research).

Run: python3 scripts/build_plans.py
Columns: service, country, plan_name, monthly_price, yearly_price, currency,
max_people_or_screens, plan_type, source_url, checked_date
"""
import glob, json, os, re, sys
import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'research', 'plans')
OUT = os.path.join(ROOT, 'src', 'app', 'plans.data.json')
# Which plan the tap list uses when the person hasn't said which one they have.
DEFAULT_ORDER = ['standard', 'individual', 'premium', 'basic', 'mobile']

def num(v):
    if v is None: return None
    s = str(v).strip().replace(' ', '').replace(' ', '')
    if not s or 'NOT' in s.upper(): return None
    if ',' in s and '.' not in s: s = s.replace(',', '.')
    s = s.replace(',', '')
    try:
        n = float(re.sub(r'[^0-9.]', '', s))
    except ValueError:
        return None
    return round(n, 2) if n > 0 else None

def key(service):
    return re.sub(r'[^a-z0-9]', '', service.lower())

data = {}
for path in sorted(glob.glob(os.path.join(SRC, '*.xlsx'))):
    wb = openpyxl.load_workbook(path, data_only=True)
    for ws in wb:
        rows = list(ws.iter_rows(values_only=True))
        head = [str(h or '').strip().lower() for h in rows[0]]
        for r in rows[1:]:
            row = dict(zip(head, r))
            if not row.get('service') or not row.get('country'): continue
            monthly = num(row.get('monthly_price'))
            if monthly is None: continue
            cc = str(row['country']).strip().upper()
            cc = 'UK' if cc == 'GB' else cc   # the app uses UK for Britain
            entry = data.setdefault(key(row['service']), {}).setdefault(cc, {'plans': [], 'checked': None, 'default': 0})
            plan = {'name': str(row.get('plan_name') or '').strip(),
                    'type': str(row.get('plan_type') or '').strip().lower(),
                    'monthly': monthly,
                    'currency': str(row.get('currency') or '').strip().upper()}
            y = num(row.get('yearly_price'))
            if y: plan['yearly'] = y
            p = num(row.get('max_people_or_screens'))
            if p: plan['people'] = int(p)
            # source_url stays in the xlsx; the app bundle only needs prices
            entry['plans'].append(plan)
            if row.get('checked_date'): entry['checked'] = str(row['checked_date'])[:10]

for svc, countries in data.items():
    for cc, e in countries.items():
        choices = [i for i, p in enumerate(e['plans']) if 'ads' not in p['name'].lower()]
        best = None
        for t in DEFAULT_ORDER:
            best = next((i for i in choices if e['plans'][i]['type'] == t), None)
            if best is not None: break
        e['default'] = best if best is not None else (choices[0] if choices else 0)

with open(OUT, 'w') as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
for svc, c in sorted(data.items()):
    print(f'{svc}: {len(c)} countries')
