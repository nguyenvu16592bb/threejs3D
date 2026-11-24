'use strict';
/* HeightmapEditor — Nhóm TERRAIN + TILESET + ENVIRONMENT
 * Xuất/nhập heightmap (JSON/base64), sinh địa hình từ value-noise tự viết
 * (deterministic theo seed, không dùng lib ngoài), làm phẳng / làm mịn
 * toàn bộ terrain. Vanilla JS, không import/export.
 */
(function () {
    window.PixiEngine = window.PixiEngine || {};
    var PE = window.PixiEngine;

    function _findTerrain(id) {
        if (PE.TerrainEditor && typeof PE.TerrainEditor.findTerrain === 'function') {
            var found = PE.TerrainEditor.findTerrain(id);
            if (found) { return found; }
        }
        if (PE.state && PE.state.objects) {
            for (var i = 0; i < PE.state.objects.length; i++) {
                if (PE.state.objects[i].id === id) { return PE.state.objects[i]; }
            }
        }
        return null;
    }

    function _terrainDataOf(obj) {
        if (!obj) { return null; }
        if (PE.TerrainEditor && typeof PE.TerrainEditor.getTerrainData === 'function') {
            return PE.TerrainEditor.getTerrainData(obj);
        }
        return obj.terrainData || (obj.userData && obj.userData.terrainData) || null;
    }

    function _apply(obj) {
        if (PE.TerrainEditor && typeof PE.TerrainEditor.applyAndNotify === 'function') {
            PE.TerrainEditor.applyAndNotify(obj);
        }
    }

    /* ---- base64 cho Float32Array (chạy được cả browser lẫn Node) ---- */
    function _f32ToBase64(arr) {
        var bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
        if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
            return Buffer.from(bytes).toString('base64');
        }
        var bin = '';
        var CHUNK = 8192;
        for (var i = 0; i < bytes.length; i += CHUNK) {
            var part = bytes.subarray(i, i + CHUNK);
            bin += String.fromCharCode.apply(null, part);
        }
        return btoa(bin);
    }

    function _base64ToF32(b64, expectedLength) {
        var bytes;
        if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
            bytes = new Uint8Array(Buffer.from(b64, 'base64'));
        } else {
            var bin = atob(b64);
            bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
        }
        if (bytes.byteLength % 4 !== 0) { return null; }
        var arr = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
        if (typeof expectedLength === 'number' && arr.length !== expectedLength) { return null; }
        return new Float32Array(arr); // copy để không giữ buffer của base64
    }

    /* ---- Value noise tự viết: hash lưới + nội suy smoothstep, fBm ---- */
    function _hash2(ix, iz, seed) {
        var h = (ix * 374761393 + iz * 668265263 + seed * 974634) | 0;
        h = (h ^ (h >> 13)) | 0;
        h = Math.imul(h, 1274126177);
        h = (h ^ (h >> 16)) >>> 0;
        return h / 4294967295; // 0..1
    }

    function _smoothstep(t) { return t * t * (3 - 2 * t); }

    function _valueNoise(x, z, seed) {
        var ix = Math.floor(x), iz = Math.floor(z);
        var fx = x - ix, fz = z - iz;
        var sx = _smoothstep(fx), sz = _smoothstep(fz);
        var v00 = _hash2(ix, iz, seed);
        var v10 = _hash2(ix + 1, iz, seed);
        var v01 = _hash2(ix, iz + 1, seed);
        var v11 = _hash2(ix + 1, iz + 1, seed);
        var a = v00 + (v10 - v00) * sx;
        var b = v01 + (v11 - v01) * sx;
        return a + (b - a) * sz; // 0..1
    }

    function _fbm(x, z, octaves, seed) {
        var sum = 0, amp = 0.5, freq = 1, norm = 0;
        for (var o = 0; o < octaves; o++) {
            sum += amp * _valueNoise(x * freq, z * freq, seed + o * 101);
            norm += amp;
            amp *= 0.5;
            freq *= 2;
        }
        return norm > 0 ? sum / norm : 0; // 0..1
    }

    var HeightmapEditor = {
        /* Xuất heightmap: trả về { json, base64, data } — data là object
         * {version, name, size, subdivisions, min, max, heightmap(base64)}. */
        exportHeightmap: function (id) {
            var obj = _findTerrain(id);
            if (!obj) { console.warn('[HeightmapEditor] Không tìm thấy terrain:', id); return null; }
            var td = _terrainDataOf(obj);
            if (!td) { return null; }
            var min = Infinity, max = -Infinity;
            for (var i = 0; i < td.heightmap.length; i++) {
                var v = td.heightmap[i];
                if (v < min) { min = v; }
                if (v > max) { max = v; }
            }
            var data = {
                version: 1,
                name: obj.name || 'Terrain',
                size: td.size,
                length: td.length,
                subdivisions: td.subdivisions,
                min: min === Infinity ? 0 : min,
                max: max === -Infinity ? 0 : max,
                heightmap: _f32ToBase64(td.heightmap)
            };
            var json = JSON.stringify(data);
            return { json: json, base64: data.heightmap, data: data };
        },

        /* Nhập heightmap: data có thể là object đã parse, chuỗi JSON,
         * hoặc chuỗi base64 thuần của Float32Array. */
        importHeightmap: function (id, data) {
            var obj = _findTerrain(id);
            if (!obj) { console.warn('[HeightmapEditor] Không tìm thấy terrain:', id); return false; }
            var td = _terrainDataOf(obj);
            if (!td) { return false; }
            var parsed = data;
            if (typeof data === 'string') {
                try {
                    parsed = JSON.parse(data);
                } catch (e) {
                    parsed = { heightmap: data }; // chuỗi base64 thuần
                }
            }
            if (!parsed || typeof parsed.heightmap === 'undefined') {
                console.warn('[HeightmapEditor] Dữ liệu heightmap không hợp lệ.');
                return false;
            }
            var arr = null;
            if (typeof parsed.heightmap === 'string') {
                arr = _base64ToF32(parsed.heightmap, td.heightmap.length);
                if (!arr) {
                    console.warn('[HeightmapEditor] Base64 heightmap sai độ dài (cần ' +
                        td.heightmap.length + ' giá trị).');
                    return false;
                }
            } else if (Array.isArray(parsed.heightmap) || parsed.heightmap instanceof Float32Array) {
                if (parsed.heightmap.length !== td.heightmap.length) {
                    console.warn('[HeightmapEditor] Heightmap sai độ dài (cần ' +
                        td.heightmap.length + ', nhận ' + parsed.heightmap.length + ').');
                    return false;
                }
                arr = parsed.heightmap;
            } else {
                console.warn('[HeightmapEditor] Định dạng heightmap không hỗ trợ.');
                return false;
            }
            td.heightmap.set(arr);
            if (typeof parsed.size === 'number' && parsed.size > 0) { td.size = parsed.size; }
            if (typeof parsed.length === 'number' && parsed.length > 0) { td.length = parsed.length; }
            _apply(obj);
            return true;
        },

        /* Sinh địa hình từ value-noise fBm. opts: {octaves=4, scale=0.08,
         * seed=1337, amplitude=10, offset=0}. Deterministic theo seed. */
        generateFromNoise: function (id, opts) {
            var obj = _findTerrain(id);
            if (!obj) { console.warn('[HeightmapEditor] Không tìm thấy terrain:', id); return false; }
            var td = _terrainDataOf(obj);
            if (!td) { return false; }
            opts = opts || {};
            var octaves = (typeof opts.octaves === 'number' && opts.octaves > 0)
                ? Math.floor(opts.octaves) : 4;
            var scale = (typeof opts.scale === 'number' && opts.scale > 0) ? opts.scale : 0.08;
            var seed = (typeof opts.seed === 'number') ? opts.seed | 0 : 1337;
            var amplitude = (typeof opts.amplitude === 'number') ? opts.amplitude : td.height;
            var offset = (typeof opts.offset === 'number') ? opts.offset : 0;
            var n = td.subdivisions + 1;
            for (var r = 0; r < n; r++) {
                for (var c = 0; c < n; c++) {
                    var noise = _fbm(c * scale, r * scale, octaves, seed);
                    td.heightmap[r * n + c] = offset + (noise - 0.5) * 2 * amplitude;
                }
            }
            _apply(obj);
            return true;
        },

        /* Làm phẳng toàn bộ terrain về chiều cao trung bình (trả về giá trị đó). */
        flattenAll: function (id) {
            var obj = _findTerrain(id);
            if (!obj) { console.warn('[HeightmapEditor] Không tìm thấy terrain:', id); return null; }
            var td = _terrainDataOf(obj);
            if (!td) { return null; }
            var sum = 0;
            for (var i = 0; i < td.heightmap.length; i++) { sum += td.heightmap[i]; }
            var avg = td.heightmap.length > 0 ? sum / td.heightmap.length : 0;
            for (var j = 0; j < td.heightmap.length; j++) { td.heightmap[j] = avg; }
            _apply(obj);
            return avg;
        },

        /* Làm mịn toàn bộ terrain bằng box blur. passes mặc định 2. */
        smoothAll: function (id, passes) {
            var obj = _findTerrain(id);
            if (!obj) { console.warn('[HeightmapEditor] Không tìm thấy terrain:', id); return false; }
            var td = _terrainDataOf(obj);
            if (!td) { return false; }
            var n = td.subdivisions + 1;
            passes = (typeof passes === 'number' && passes > 0) ? Math.floor(passes) : 2;
            for (var p = 0; p < passes; p++) {
                var src = td.heightmap.slice();
                for (var r = 0; r < n; r++) {
                    for (var c = 0; c < n; c++) {
                        var sum = 0, cnt = 0;
                        for (var dr = -1; dr <= 1; dr++) {
                            for (var dc = -1; dc <= 1; dc++) {
                                var rr = r + dr, cc = c + dc;
                                if (rr < 0 || rr >= n || cc < 0 || cc >= n) { continue; }
                                sum += src[rr * n + cc];
                                cnt++;
                            }
                        }
                        td.heightmap[r * n + c] = cnt > 0 ? sum / cnt : src[r * n + c];
                    }
                }
            }
            _apply(obj);
            return true;
        },

        /* Hàm nội bộ: value noise dùng chung (TerrainBrush có thể tái dùng). */
        valueNoise: _valueNoise,
        fbm: _fbm
    };

    PE.HeightmapEditor = HeightmapEditor;
})();
