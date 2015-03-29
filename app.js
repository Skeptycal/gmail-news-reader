var Google = (function(){
  var clientId = '18132784689-ebqhe8ekabrrck6jmbci2u1c9acg0gii.apps.googleusercontent.com';

  var scopes = 'https://mail.google.com/,https://www.googleapis.com/auth/gmail.modify,https://www.googleapis.com/auth/gmail.readonly';

  function handleClientLoad() {
    window.setTimeout(checkAuth,1);
  }

  function checkAuth() {
    gapi.auth.authorize({client_id: clientId, scope: scopes, immediate: true}, handleAuthResult);
  }

  function loadGmailAPI(callback) {
    gapi.client.load('gmail', 'v1').then(callback)
  }

  function handleAuthResult(authResult) {
    var authorizeButton = document.getElementById('authorize-button');
    var splash = document.getElementById('splash');
    var spinner = document.getElementById('spinner');

    if (authResult && !authResult.error) {
      splash.style.display = 'none';
      loadGmailAPI(App.loadMessages);
    } else {
      authorizeButton.style.display = 'block';
      spinner.style.display = 'none';
      authorizeButton.onclick = handleAuthClick;
    }
  }

  function handleAuthClick(event) {
    // Step 3: get authorization to use private data
    gapi.auth.authorize({client_id: clientId, scope: scopes, immediate: false}, handleAuthResult);
    return false;
  }

  var messageRequest = function(id, params) {
    return gapi.client.request({
      'path': 'gmail/v1/users/me/messages/' + id,
      'params': params
     });
  };

  function listMessages(query, nextPageToken, callback) {
    gapi.client.gmail.users.messages.list({
      'userId': 'me',
      'pageToken': nextPageToken,
      'q': query,
      'fields': 'messages/id,nextPageToken'
    }).execute(function(resp){
      var nextPageToken = resp.nextPageToken;
      var batch = gapi.client.newBatch();

      resp.messages.forEach(function(message){
        if (message) {
          batch.add(messageRequest(message.id, { format: 'full' }))
        }
      })

      batch.execute(function(resp){
        callback(resp, nextPageToken)
      })
    })
  }

  function modifyMessage(messageId, labelsToAdd, labelsToRemove, callback) {
    var request = gapi.client.gmail.users.messages.modify({
      'userId': 'me',
      'id': messageId,
      'addLabelIds': labelsToAdd,
      'removeLabelIds': labelsToRemove
    });
    request.execute(callback);
  }

  function signOut() {
    var iframe = $('<iframe id="logoutframe" src="https://accounts.google.com/logout" style="display: none"></iframe>')
    $(document.body).append(iframe)

    iframe.load(function(){
      window.location.reload()
    })
  }

  return {
    handleClientLoad: handleClientLoad,
    signOut: signOut,
    listMessages: listMessages,
    modifyMessage: modifyMessage
  }
}())

var handleClientLoad = Google.handleClientLoad;


var App = (function(){

  function init() {
    $('header .config-filter').html(App.search_filter);

    if (!App.mark_read) {
      $('header .config-mark-read').addClass('disabled')
    }
  }

  function loadMessages(nextPageToken){
    App.loading = true

    $('section').append('<div class="spinner"></div>')

    if (!nextPageToken)
      $('section ul').html('')

    Google.listMessages(App.search_filter, nextPageToken, function(messages, nextPageToken){
      App.nextPageToken = nextPageToken;
      App.messages = $.extend(App.messages, messages);

      renderMessages(messages);

      App.loading = false;
    })
  }

  function prettyDate(d) {
    var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    return d.getDate() + " " + monthNames[d.getMonth()] + " " + d.getFullYear()
  }

  function renderMessages(messages){
    var html = '';

    var sorted_messages = []
    for (k in messages) {
      sorted_messages.push({
        id: k,
        date: new Date(_.find(messages[k].result.payload.headers, 'name', 'Date').value),
        subject: _.find(messages[k].result.payload.headers, 'name', 'Subject').value,
        snippet: messages[k].result.snippet,
        labels: messages[k].result.labelIds
      })
    }

    sorted_messages = _.sortBy(sorted_messages, 'date').reverse()

    sorted_messages.forEach(function(m){
      html += "<li data-id='"+m.id+"' class='"+m.labels.join(' ')+"'>"
      html += "<h4>" + m.subject + "</h4>"
      html += "<p>" + m.snippet + "</p>"
      html += "<time>" + prettyDate(m.date) + "</time>"
      html += "<a href='#' class='mark-read'>Mark as read</a>"
      html += "<a href='#' class='mark-unread'>Mark as unread</a>"
      html += "<a href='#' class='add-star'>Add star</a>"
      html += "<a href='#' class='remove-star'>Remove star</a>"
      html += "</li>"
    })

    $('section ul').append(html)
    $('section .spinner').remove()
  }

  function setSearchFilter(filter){
    App.search_filter = filter
    window.localStorage.search_filter = filter

    App.loadMessages()
  }

  function setMarkReadOption(mark_read){
    App.mark_read = mark_read
    window.localStorage.mark_read = mark_read
  }

  return {
    loading: false,
    nextPageToken: null,
    mark_read: window.localStorage.mark_read == "false" ? false : true,
    search_filter: window.localStorage.search_filter || "label:unread",
    messages: [],
    init: init,
    loadMessages: loadMessages,
    setSearchFilter: setSearchFilter,
    setMarkReadOption: setMarkReadOption
  }
}())

$(App.init)

var urlRegex =/(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;

function extractUrlFromText(text) {
  var urls = text.match(urlRegex)

  for (var i=0; i<urls.length; i++) {
    if (urls[i].match(/^http:\/\/t\.co/)) {
      return urls[i]
    }
  }

  return urls[0]
}

function _modifyFlag(node, add, remove) {
  var message_id = $(node).data('id')
  var message = App.messages[message_id]

  if (add.length > 0) {
    $(node).addClass(add.join(' '))
    Google.modifyMessage(message.result.id, add, [])
  }

  if (remove.length > 0) {
    $(node).removeClass(remove.join(' '))
    Google.modifyMessage(message.result.id, [], remove)
  }
}

$(document).on('click', 'section li a.mark-read', function(e) {
  _modifyFlag(this.parentNode, [], ["UNREAD"])
  return false
})

$(document).on('click', 'section li a.mark-unread', function(e) {
  _modifyFlag(this.parentNode, ["UNREAD"], [])
  return false
})

$(document).on('click', 'section li a.remove-star', function(e) {
  _modifyFlag(this.parentNode, [], ["STARRED"])
  return false
})

$(document).on('click', 'section li a.add-star', function(e) {
  _modifyFlag(this.parentNode, ["STARRED"], [])
  return false
})

$(document).on('click', 'section li', function(e) {
  var message_id = $(e.currentTarget).data('id')
  var message = App.messages[message_id]

  if (App.mark_read) {
    Google.modifyMessage(message.result.id, [], ['UNREAD'])
    $(e.currentTarget).removeClass('UNREAD')
  }

  var body = message.result.payload.body.data || message.result.payload.parts[1].body.data
  body = atob(body.replace(/-/g, '+').replace(/_/g, '/'))

  var url = extractUrlFromText(body);

  window.open(url)
});

$(document).on('click', 'header .config-filter', function(e){
  var filter = prompt("Please enter search filter, same format as used in Gmail search", App.search_filter);
  if (filter != null) {
    $(this).html(filter)

    App.setSearchFilter(filter);
  }
})

$(document).on('click', 'header .config-mark-read', function(e){
  $(this).toggleClass('disabled');

  App.setMarkReadOption(!$(this).hasClass('disabled'))
})

$(document).on('click', 'header .signout', function(e){
  Google.signOut()
})

$(window).scroll(function() {
  if($(window).scrollTop() + $(window).height() > $(document).height() - 300) {
    if (!App.loading && App.nextPageToken) {
      App.loadMessages(App.nextPageToken)
    }
  }
});