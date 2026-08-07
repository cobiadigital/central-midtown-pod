// Chapter jump list. The only client-side JavaScript on the site.
//
// Everything works without it: the audio element has native controls, and the
// chapter list is still readable. This just makes the timestamps seek.

(function () {
  var audio = document.getElementById('episode-audio');
  if (!audio) return;

  var buttons = document.querySelectorAll('.chapter-jump');
  if (!buttons.length) return;

  function seek(seconds) {
    try {
      audio.currentTime = seconds;
      var playing = audio.play();
      if (playing && typeof playing.catch === 'function') {
        // Autoplay policies can reject this. Seeking already happened, so the
        // listener just presses play themselves.
        playing.catch(function () {});
      }
    } catch (error) {
      // Metadata may not be loaded yet; try again once it is.
      audio.addEventListener(
        'loadedmetadata',
        function () {
          audio.currentTime = seconds;
        },
        { once: true }
      );
    }
  }

  Array.prototype.forEach.call(buttons, function (button) {
    button.addEventListener('click', function () {
      var start = Number(button.getAttribute('data-start'));
      if (!isFinite(start)) return;
      seek(start);
      audio.focus();
    });
  });

  // Reflect the chapter currently playing, for orientation on long episodes.
  var starts = Array.prototype.map.call(buttons, function (button) {
    return Number(button.getAttribute('data-start')) || 0;
  });

  audio.addEventListener('timeupdate', function () {
    var current = audio.currentTime;
    var active = -1;
    for (var i = 0; i < starts.length; i++) {
      if (starts[i] <= current) active = i;
    }
    for (var j = 0; j < buttons.length; j++) {
      if (j === active) {
        buttons[j].setAttribute('aria-current', 'true');
      } else {
        buttons[j].removeAttribute('aria-current');
      }
    }
  });
})();
