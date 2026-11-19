// Shows the address Factorial redirected to, so it can be pasted into the
// terminal that started the login. Nothing leaves the browser: no request is
// made and nothing is stored.
(function () {
  'use strict';

  var address = window.location.href;
  var params = new URLSearchParams(window.location.search);
  var title = document.getElementById('title');
  var message = document.getElementById('message');
  var result = document.getElementById('result');
  var field = document.getElementById('address');
  var copy = document.getElementById('copy');
  var copied = document.getElementById('copied');

  var error = params.get('error');
  var code = params.get('code');
  if (!error && !code) return;

  // Keep the one-time code out of the address bar and the tab's history entry.
  var scrubbed = false;
  try {
    window.history.replaceState(null, '', window.location.pathname);
    scrubbed = true;
  } catch (e) {
    // The address simply stays where it is.
  }

  if (error) {
    // Only a short error code is shown: free text from the address could be
    // written by anyone who crafts a link to this page.
    var known = /^[a-z_]{1,40}$/.test(error) ? ' (' + error + ')' : '';
    title.textContent = 'Login not authorized';
    message.textContent =
      'The login was not authorized' +
      known +
      '. Return to the terminal and run the login command again.';
    return;
  }

  title.textContent = 'Almost done';
  message.textContent =
    'This address carries a login code. Copy it and paste it into the terminal that is waiting for it. The terminal checks that it belongs to the login you started.';
  field.value = address;
  if (scrubbed) {
    document.getElementById('note').textContent +=
      " It has been removed from this tab's address bar.";
  }
  result.hidden = false;

  function select() {
    field.focus();
    field.select();
  }

  copy.addEventListener('click', function () {
    var done = function () {
      copied.textContent = 'Copied. Paste it into the terminal.';
    };
    var manual = function () {
      select();
      copied.textContent = 'Press Ctrl+C or Cmd+C to copy the selected address.';
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(address).then(done, manual);
    } else {
      manual();
    }
  });
  field.addEventListener('focus', function () {
    field.select();
  });
})();
