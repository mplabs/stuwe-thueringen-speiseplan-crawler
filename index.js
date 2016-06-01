'use strict';

const cheerio = require('cheerio');
const http = require('http');
const iconv = require('iconv-lite');
const moment = require('moment');
const nano = require('nano')('https://couchdb.mplabs.de');
const querystring = require('querystring');

const URL = 'http://www.stw-thueringen.de/deutsch/mensen/einrichtungen/ilmenau/cafeteria-roentgenbau.html';

// Set locale for date handling
moment.locale('de');

var db = nano.db.use('speiseplan');

function retreive(options, postData, cb) {
    var req = http.request(options, function(res) {
        var chunks = [];
               
        res.on('data', function(chunk) {
            chunks.push(chunk);
        });

        res.on('end', function() {
            var body = iconv.decode(Buffer.concat(chunks), 'win1252');
            return cb.call(null, body);
        });

        res.on('error', function(err) {
            throw Error("Request failed:", err);
        });
    });

    req.write(postData);
    req.end();
}

var postData = querystring.stringify({
    "selWeek": moment().add(1, 'w').format('YYYY-WW'),
    "selView": "liste",
    "ORT_ID": 4480,
    "aktion": "changeWeek",
    "vbLoc": 4480,
    "lang": 1,
    "client": null
});

var options = {
    hostname: 'www.stw-thueringen.de',
    port: 80,
    path: '/deutsch/mensen/einrichtungen/ilmenau/cafeteria-roentgenbau.html',
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': postData.length
    }
};

retreive(options, postData, function(body) {    
    var $ = cheerio.load(body);
    var days = [];
    $('div:nth-child(6) > div, table', 'form[name="hsf_speiseplan"]').each(function(index) {
        var day = $(this);
        var isHeading = !(index % 2);

        if(day.get(0).tagName === 'table' &&
           day.attr('style') !== 'border: 1px solid #fff;') {
            return;
        }

        if (isHeading) {
            var date = moment(day.text(), "dddd, DD.MM.YYYY");
            days.push({
                date: date,
                dateString: date.format(),
                meals: []
            });
        } else {
            $('tr', day).filter(function() {
                return $(this).children('td').length > 0;
            }).each(function() {
                var meal = {};
                $(this).children().each(function(index) {
                    var field = $(this);                   
                    switch(index) {

                        case 0:
                            meal.ausgabe = field.text();
                        break;

                        case 1:
                            meal.name = field.text().match(/.+/)[0].trim();
                            meal.kennzeichen = field.text().match(/Inhalt:(.*)/)[1].trim();
                        break;

                        case 2:
                            meal.preis = field.text().trim();
                        break;                        
                    }
                });
                days[days.length - 1].meals.push(meal);
            });
        }
    });
    
    days.forEach(function(day) {
        var timestamp = day.date.format('x');
        delete day.date;
        db.insert(day, timestamp, function(err, day) {
            if (err) console.error("Insert failed");
            db.insert(day, timestamp, function(err, day) {
                if (err) console.error("Update failed");
            });
        });
    });
});
