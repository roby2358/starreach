$(document).ready(function() {
    $.get('/state', function(data) {
        $('#game-state').text(JSON.stringify(data));
    });
}); 