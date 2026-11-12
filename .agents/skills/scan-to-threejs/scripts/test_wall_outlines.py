"""Synthetic wall-boundary checks; no captured room data is used here."""
import copy
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name('bundle_to_room.py')


def transform(x=7, y=0, z=-5, angle=0.3):
    c, s = math.cos(angle), math.sin(angle)
    return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, y, z, 1]


def room(corners=None, raised=0, reverse=False):
    floor_y = 1.7
    floor_z = -4 if reverse else 4
    wall = {'identifier': 'fixture-wall', 'transform': transform(y=floor_y + 2 + raised),
            'dimensions': [6, 4, 0], 'confidence': {'high': {}}}
    if corners is not None:
        wall['polygonCorners'] = corners
    return {'walls': [wall], 'floors': [{'transform': transform(y=floor_y),
            'polygonCorners': [[-4, 0, 0], [4, 0, 0], [4, 0, floor_z], [-4, 0, floor_z]]}]}


def canonical(points):
    points = [list(p) for p in points]
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:] + points[:1]))
    if area < 0:
        points.reverse()
    first = min(range(len(points)), key=lambda i: points[i])
    return points[first:] + points[:first]


class WallOutlineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'rooms').mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def convert(self, source, turn=0, existing=None):
        (self.root / 'rooms/room-0.json').write_text(json.dumps(source))
        out = self.root / 'converted.json'
        if out.exists():
            out.unlink()
        if existing is not None:
            out.write_text(existing)
        result = subprocess.run([sys.executable, str(SCRIPT), str(self.root), '--room', '0',
                                 '--turn', str(turn), '-o', str(out)], capture_output=True, text=True)
        return result, out

    def assert_outline(self, source, expected, turn=0):
        result, out = self.convert(source, turn)
        self.assertEqual(result.returncode, 0, result.stderr)
        wall = json.loads(out.read_text())['walls'][0]
        self.assertIn('outline', wall, 'conversion must preserve the wall boundary')
        actual = wall['outline']
        self.assertEqual(len(actual), len(expected))
        for actual_point, expected_point in zip(actual, canonical(expected)):
            for a, e in zip(actual_point, expected_point):
                self.assertAlmostEqual(a, e, delta=0.001)
        area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(actual, actual[1:] + actual[:1]))
        self.assertGreater(area, 0)
        return wall

    def test_source_rectangles_preserve_floor_offset(self):
        for corners in (None, []):
            for raised in (0, 0.4):
                with self.subTest(corners=corners, raised=raised):
                    self.assert_outline(room(corners, raised),
                                        [[0, raised], [6, raised], [6, 4 + raised], [0, 4 + raised]])

    def test_gable_and_asymmetric_profiles_in_final_basis(self):
        profiles = [
            [[-3, -2, 0], [3, -2, 0], [3, 0, 0], [-1, 2, 0], [-3, 0, 0]],
            [[-3, -2, 0], [3, -2, 0], [3, -0.5, 0], [1, 2, 0], [-3, 2, 0]],
        ]
        for profile in profiles:
            for reverse in (False, True):
                for turn in range(4):
                    with self.subTest(profile=profile, reverse=reverse, turn=turn):
                        expected = [[3 - x if reverse else x + 3, y + 2] for x, y, _ in profile]
                        self.assert_outline(room(profile, reverse=reverse), expected, turn)

    def test_winding_start_and_closing_vertex_are_normalized(self):
        corners = [[-3, -2, 0], [3, -2, 0], [3, 0, 0], [-1, 2, 0], [-3, 0, 0]]
        expected = [[0, 0], [6, 0], [6, 2], [2, 4], [0, 2]]
        for points in (corners, list(reversed(corners)), corners[2:] + corners[:2], corners + corners[:1]):
            with self.subTest(points=points):
                self.assert_outline(room(points), expected)

    def test_openings_share_the_reversed_outline_basis(self):
        source = room([[-3, -2, 0], [3, -2, 0], [3, 0, 0], [-1, 2, 0], [-3, 0, 0]], reverse=True)
        c, s = math.cos(0.3), math.sin(0.3)
        for key, x, bottom, height in [('doors', -2, 0, 2), ('windows', 1, 1, 1)]:
            source[key] = [{'parentIdentifier': 'fixture-wall',
                            'transform': transform(x=7 + c * x, y=1.7 + bottom + height / 2, z=-5 - s * x),
                            'dimensions': [0.8, height, 0], 'category': {key[:-1]: {}}}]
        wall = self.assert_outline(source, [[6, 0], [0, 0], [0, 2], [4, 4], [6, 2]])
        self.assertEqual([(o['kind'], o['u0'], o['u1'], o['v0'], o['v1']) for o in wall['openings']],
                         [('window', 1.6, 2.4, 1, 2), ('door', 4.6, 5.4, 0, 2)])

    def test_invalid_boundaries_fail_before_writing(self):
        invalid = {
            'nonfinite': [[-3, -2, 0], [3, -2, 0], [float('nan'), 2, 0]],
            'two-points': [[-3, -2, 0], [3, -2, 0]],
            'zero-area': [[-3, 0, 0], [0, 0, 0], [3, 0, 0]],
            'duplicate': [[-3, -2, 0], [3, -2, 0], [3, 2, 0], [3, -2, 0], [-3, 2, 0]],
            'self-intersection': [[-3, -2, 0], [3, 2, 0], [-3, 2, 0], [2, -2, 0]],
            'off-plane': [[-3, -2, 0], [3, -2, 0], [3, 2, 0.01], [-3, 2, 0]],
        }
        for label, corners in invalid.items():
            for existing in (None, 'keep existing output'):
                with self.subTest(label=label, existing=existing):
                    result, out = self.convert(room(copy.deepcopy(corners)), existing=existing)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn('fixture-wall', result.stderr)
                    if existing is None:
                        self.assertFalse(out.exists())
                    else:
                        self.assertEqual(out.read_text(), existing)


if __name__ == '__main__':
    unittest.main()
