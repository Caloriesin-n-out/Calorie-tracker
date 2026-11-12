#!/usr/bin/env python3
"""Turn a Health-All-In backup into a Calorie tracker backup that holds saved foods only.

Usage:  python3 -I scripts/health-all-to-foods.py <health-all-backup.json> <output.json>

Import the output with Settings > Import backup in the app. It never touches your log:
only `foods` is filled. Reads food keys only, so API keys and other settings in the
Health-All file are ignored.

Sources, in order (a name already taken is kept, later ones only fill gaps):
  1. hai_custom_foods   the foods you made or saved
  2. hai_favourites, hai_recents
  3. foods that only appear in the logged nutrition (hai_nutrition_flat)
Foods are matched by lower-case name. Values are per 100 g, as in the app.
"""
import json, re, sys


def num(v):
    try:
        return None if v is None or v == '' else float(v)
    except (TypeError, ValueError):
        return None


def r1(v):
    return None if v is None else round(v * 10) / 10


def main(src, dst):
    raw = json.load(open(src, encoding='utf-8'))
    data = raw['data']
    load = lambda k, default: json.loads(data[k]) if k in data else default
    exported_ms = 0
    try:
        from datetime import datetime
        exported_ms = int(datetime.fromisoformat(raw['_exported'].replace('Z', '+00:00')).timestamp() * 1000)
    except Exception:
        pass

    portions = load('hai_food_portions', {})
    foods, skipped = {}, []

    def add(name, brand, kcal, p, c, f, serving_g, source, last_g=None):
        name = (name or '').strip()
        if not name or name.lower() == 'food':
            skipped.append(f'no usable name ({source})')
            return
        k = num(kcal)
        if k is None:
            skipped.append(f'{name}: no calories')
            return
        low = name.lower()
        if low in foods:
            return
        per100 = {'kcal': round(k), 'p': r1(num(p)), 'c': r1(num(c)), 'f': r1(num(f))}
        key = 'name:' + name.lower() + '|' + str(per100['kcal'])
        item = {'key': key, 'name': name, 'brand': (brand or '').strip(), 'per100': per100,
                'source': 'manual', 'updatedAt': exported_ms or 1}
        sg = num(serving_g)
        if sg and sg > 0:
            item['servingG'] = sg
        pt = portions.get(low)
        if pt and pt.get('unit') in ('g', 'ml') and num(pt.get('amount')):
            item['lastGrams'] = num(pt['amount'])
        elif last_g:
            item['lastGrams'] = last_g
        foods[low] = (key, item)

    def serving_for(x):
        return x.get('serving_size') if x.get('serving_unit') in ('g', 'ml') else None

    for x in load('hai_custom_foods', []):
        add(x.get('name'), x.get('brand'), x.get('cal_100'), x.get('prot_100'), x.get('carbs_100'),
            x.get('fat_100'), serving_for(x), 'custom')
    for k in ('hai_favourites', 'hai_recents'):
        for x in load(k, []):
            add(x.get('name'), x.get('brand'), x.get('cal_100'), x.get('prot_100'), x.get('carbs_100'),
                x.get('fat_100'), serving_for(x), k)
    # logged-only foods: per-100 g from one logged serving, when its size is known in grams.
    # perCal/perProt/... are for ONE serving; cal/prot/... are multiplied by qty.
    for x in load('hai_nutrition_flat', []):
        m = re.search(r'([\d.]+)\s*(?:g|ml)\b', str(x.get('serving', '')))
        g = num(m.group(1)) if m else None
        one = lambda per, tot: num(x.get(per)) if num(x.get(per)) is not None else (num(x.get(tot)) or 0) / (num(x.get('qty')) or 1)
        cal = one('perCal', 'cal')
        name = (x.get('food_name') or '').strip()
        if not g or cal is None:
            if name.lower() not in foods:
                skipped.append(f'{name}: logged without a gram amount')
            continue
        s = 100 / g
        add(name, '', cal * s, one('perProt', 'prot') * s, one('perCarbs', 'carbs') * s,
            one('perFat', 'fat') * s, g, 'log', last_g=g)

    out = {'app': 'intake', 'version': 1, 'exportedAt': exported_ms or 0, 'entries': {},
           'foods': {key: item for key, item in foods.values()}, 'fit': {}}
    json.dump(out, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{len(out["foods"])} foods written to {dst}')
    for s in skipped:
        print('skipped:', s)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
