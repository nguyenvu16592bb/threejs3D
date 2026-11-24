'use strict';
/* Timeline — Thanh timeline thật: playhead kéo được (pointer + touch),
 * thời gian hiện tại/tổng, Play/Pause/Stop, loop, keyframe markers.
 * Nhóm ANIMATION. Vanilla JS, không import/export. */
(function () {
    window.PixiEngine = window.PixiEngine || {};
    var PE = window.PixiEngine;

    var container = null;
    var duration = 5;      // giây
    var currentTime = 0;   // giây
    var playing = false;
    var loop = true;
    var rafId = null;
    var lastTs = 0;
    var scrubCb = null;
    var dragging = false;

    function log(msg) {
        if (typeof console !== 'undefined' && console.log) console.log('[Timeline] ' + msg);
    }
    function fmt(t) {
        t = Math.max(0, t || 0);
        var m = Math.floor(t / 60);
        var s = (t % 60).toFixed(2);
        return (m > 0 ? m + ':' + (s < 10 ? '0' : '') : '') + s + 's';
    }
    function getScene() {
        if (PE.state && PE.state.scene) return PE.state.scene;
        return null;
    }

    function setDuration(sec) {
        duration = Math.max(0.1, Number(sec) || 5);
        if (currentTime > duration) currentTime = duration;
        render();
    }
    function setTime(t) {
        currentTime = Math.max(0, Math.min(duration, Number(t) || 0));
        // Đồng bộ animation thật
        if (PE.AnimationEditor && typeof PE.AnimationEditor.scrub === 'function') {
            PE.AnimationEditor.scrub(currentTime);
        } else {
            var scene = getScene();
            if (scene && scene.animationGroups) {
                scene.animationGroups.forEach(function (g) {
                    if (typeof g.goToFrame === 'function' && g.isPlaying) {
                        try {
                            var fps = 30;
                            var ta = g.targetedAnimations && g.targetedAnimations[0];
                            if (ta && ta.animation) fps = ta.animation.framePerSecond || 30;
                            g.goToFrame(g.from + currentTime * fps);
                        } catch (e) {}
                    }
                });
            }
        }
        updatePlayheadUI();
        if (scrubCb) scrubCb(currentTime);
    }
    function onScrub(cb) { scrubCb = cb; }

    function tick(ts) {
        if (!playing) return;
        if (!lastTs) lastTs = ts;
        var dt = (ts - lastTs) / 1000;
        lastTs = ts;
        currentTime += dt;
        if (currentTime >= duration) {
            if (loop) {
                currentTime = currentTime % duration;
                if (PE.AnimationEditor && typeof PE.AnimationEditor.playClip === 'function') {
                    // Clip loop sẵn qua play(true); chỉ reset playhead
                }
            } else {
                currentTime = duration;
                pause();
            }
        }
        updatePlayheadUI();
        rafId = requestAnimationFrame(tick);
    }

    function play() {
        if (playing) return;
        playing = true;
        lastTs = 0;
        // Nếu AnimationEditor đang có clip thì resume nó
        var scene = getScene();
        if (scene && scene.animationGroups) {
            var anyPlaying = false;
            scene.animationGroups.forEach(function (g) { if (g.isPlaying) anyPlaying = true; });
            if (!anyPlaying && PE.AnimationEditor && typeof PE.AnimationEditor.getCurrentGroup === 'function') {
                var g = PE.AnimationEditor.getCurrentGroup();
                if (g && typeof g.play === 'function') g.play(true);
            }
        }
        rafId = requestAnimationFrame(tick);
        updateButtonsUI();
        log('Timeline: phát.');
    }
    function pause() {
        playing = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        if (PE.AnimationEditor && typeof PE.AnimationEditor.pause === 'function') {
            PE.AnimationEditor.pause();
        }
        updateButtonsUI();
        log('Timeline: tạm dừng.');
    }
    function stop() {
        pause();
        currentTime = 0;
        if (PE.AnimationEditor && typeof PE.AnimationEditor.stop === 'function') {
            PE.AnimationEditor.stop();
        }
        updatePlayheadUI();
        log('Timeline: dừng, về 0.');
    }

    function updatePlayheadUI() {
        if (!container) return;
        var head = container.querySelector('[data-tl-playhead]');
        var fill = container.querySelector('[data-tl-fill]');
        var timeEl = container.querySelector('[data-tl-time]');
        var pct = duration > 0 ? (currentTime / duration) * 100 : 0;
        if (head) head.style.left = pct + '%';
        if (fill) fill.style.width = pct + '%';
        if (timeEl) timeEl.textContent = fmt(currentTime) + ' / ' + fmt(duration);
    }
    function updateButtonsUI() {
        if (!container) return;
        var playBtn = container.querySelector('[data-act="play"]');
        if (playBtn) playBtn.textContent = playing ? '⏸ Tạm dừng' : '▶ Phát';
    }

    /* Markers: từ animation events nếu có, nếu không thì markers tại 0 và cuối. */
    function markersHtml() {
        var markers = [{ t: 0, label: 'Bắt đầu' }, { t: duration, label: 'Kết thúc' }];
        var scene = getScene();
        if (scene && scene.animationGroups) {
            scene.animationGroups.forEach(function (g) {
                if (g.isPlaying || (PE.AnimationEditor && PE.AnimationEditor.getCurrentGroup && PE.AnimationEditor.getCurrentGroup() === g)) {
                    // Animation events (nếu group có target có animation events)
                    (g.targetedAnimations || []).forEach(function (ta) {
                        var anim = ta.animation;
                        if (anim && anim.events) {
                            anim.events.forEach(function (ev) {
                                var fps = anim.framePerSecond || 30;
                                var t = (ev.frame - g.from) / fps;
                                if (t >= 0 && t <= duration) markers.push({ t: t, label: 'Event @' + fmt(t) });
                            });
                        }
                    });
                }
            });
        }
        return markers.map(function (m) {
            var pct = duration > 0 ? (m.t / duration) * 100 : 0;
            return '<div title="' + m.label.replace(/"/g, '') + '" style="position:absolute;left:' + pct + '%;top:-2px;width:2px;height:16px;background:#f6c453;"></div>';
        }).join('');
    }

    function render() {
        if (!container) return;
        var track = container.querySelector('[data-tl-track]');
        if (track) {
            track.innerHTML = '<div data-tl-fill style="position:absolute;left:0;top:0;height:100%;width:0%;background:rgba(43,108,176,.5);"></div>' +
                markersHtml() +
                '<div data-tl-playhead style="position:absolute;left:0%;top:-4px;width:3px;height:20px;background:#fff;box-shadow:0 0 4px #000;cursor:ew-resize;"></div>';
            bindTrack(track);
        }
        updatePlayheadUI();
        updateButtonsUI();
        var loopBtn = container.querySelector('[data-act="loop"]');
        if (loopBtn) loopBtn.textContent = loop ? '🔁 Loop: Bật' : '🔁 Loop: Tắt';
    }

    function bindTrack(track) {
        function timeFromEvent(e) {
            var rect = track.getBoundingClientRect();
            var clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
            var ratio = (clientX - rect.left) / rect.width;
            ratio = Math.max(0, Math.min(1, ratio));
            return ratio * duration;
        }
        function onDown(e) {
            dragging = true;
            if (e.preventDefault) e.preventDefault();
            setTime(timeFromEvent(e));
        }
        function onMove(e) {
            if (!dragging) return;
            if (e.preventDefault) e.preventDefault();
            setTime(timeFromEvent(e));
        }
        function onUp() { dragging = false; }
        track.addEventListener('pointerdown', onDown);
        track.addEventListener('pointermove', onMove);
        track.addEventListener('pointerup', onUp);
        track.addEventListener('pointercancel', onUp);
        // Touch fallback (máy cũ không có Pointer Events)
        track.addEventListener('touchstart', onDown, { passive: false });
        track.addEventListener('touchmove', onMove, { passive: false });
        track.addEventListener('touchend', onUp);
    }

    function init(containerId) {
        containerId = containerId || 'timeline-panel';
        if (typeof document === 'undefined') return false;
        container = document.getElementById(containerId);
        if (!container) {
            log('Không tìm thấy container #' + containerId + ' — Timeline chưa gắn UI.');
            return false;
        }
        container.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<h3 style="margin:0;">⏱ Timeline</h3>' +
            '<span data-tl-time style="font-size:12px;color:#aaa;">0.00s / 5.00s</span>' +
            '</div>' +
            '<div data-tl-track style="position:relative;height:12px;background:#222;border:1px solid #444;border-radius:6px;margin:10px 0;cursor:pointer;touch-action:none;"></div>' +
            '<div style="display:flex;gap:6px;">' +
            '<button data-act="play" style="flex:1;padding:6px;background:#2b6cb0;color:#fff;border:none;border-radius:6px;cursor:pointer;">▶ Phát</button>' +
            '<button data-act="stop" style="flex:1;padding:6px;background:#333;color:#fff;border:1px solid #555;border-radius:6px;cursor:pointer;">⏹ Dừng</button>' +
            '<button data-act="loop" style="flex:1;padding:6px;background:#333;color:#fff;border:1px solid #555;border-radius:6px;cursor:pointer;">🔁 Loop: Bật</button>' +
            '</div>';
        container.querySelector('[data-act="play"]').addEventListener('click', function () {
            if (playing) pause(); else play();
        });
        container.querySelector('[data-act="stop"]').addEventListener('click', stop);
        container.querySelector('[data-act="loop"]').addEventListener('click', function () {
            loop = !loop;
            render();
        });
        // Đồng bộ duration với clip đang chọn (nếu có)
        if (PE.AnimationEditor && typeof PE.AnimationEditor.listClips === 'function') {
            var clips = PE.AnimationEditor.listClips();
            if (clips.length && clips[0].duration > 0) duration = clips[0].duration;
        }
        render();
        log('Timeline đã khởi tạo (#' + containerId + ').');
        return true;
    }

    var Timeline = {
        init: init,
        setDuration: setDuration,
        setTime: setTime,
        render: render,
        onScrub: onScrub,
        play: play,
        pause: pause,
        stop: stop,
        getTime: function () { return currentTime; },
        getDuration: function () { return duration; },
        isPlaying: function () { return playing; }
    };
    PE.Timeline = Timeline;
})();
