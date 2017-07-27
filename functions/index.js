'use strict'

// Set up dependencies
const ApiAiApp = require('actions-on-google').ApiAiApp;
const functions = require('firebase-functions');
const https = require('https');

// Export firebase function
exports.synbiobot = functions.https.onRequest((request, response) => {
	const app = new ApiAiApp({request: request, response: response});

    function getPart (app) {
		let url = 'https://parts.igem.org/cgi/xml/part.cgi?part=' + app.getArgument('iGEMPartName');

        getData(url, 'xml', function (data) {
			let part = data.rsbpml.part_list[0].part[0];

			// There's a lot of use of ternary operators to check if a piece of
			// data exists, as data is not guaranteed for every part.
			let title = 'Part ' + part.part_name[0] + (part.part_nickname[0] ? ' (' + part.part_nickname[0] + ')' : '');

			let speech = '';
			speech += 'Part ' + part.part_short_name[0] + ' ';
			speech += (part.part_type[0] ? 'is a ' + part.part_type[0] : '');
			speech += (part.part_results[0] == "Works" ? ' that works' : '');
			speech += (part.part_author[0] ? ', designed by ' + part.part_author[0].clean() + '.' : '.');

			let text = '';
			text += (part.part_type[0] ? '**Type:** ' + part.part_type[0] + '  \n': '');
			text += (part.part_short_desc[0] ? '**Desc:** ' + part.part_short_desc[0] + '  \n': '');
			text += (part.part_results[0] ? '**Results:** ' + part.part_results[0] + '  \n': '');
			text += (part.release_status[0] ? '**Release status:** ' + part.release_status[0] + '  \n': '');
			text += (part.sample_status[0] ? '**Availability:** ' + part.sample_status[0] + '  \n': '');
			// Tidies the author field; trims excess whitespace and remove fullstop, if present.
			text += (part.part_author[0] ? '**Designed by:** ' + part.part_author[0].clean() + '  \n': '');
			text += '  \nData provided by the iGEM registry';

			let destinationName = 'iGEM Registry';
			let suggestionUrl = (part.part_url[0] ? part.part_url[0] : 'https://parts.igem.org/Part:' + app.getArgument('iGEMPartName'));
			let suggestions = ['Search for another part', 'Exit'];

			// app.setContext('iGEM_part', 1, part);
			askWithBasicCardAndLinkAndSuggestions(speech, title, text, destinationName, suggestionUrl, suggestions);
        });
    }

	function protocatSearch (app) {
		// TODO: Use HTTPS
		// https://github.com/MiBioSoft2017/ProtoCat4/issues/17
		let url = 'http://protocat.org/api/protocol/?format=json';

		getData(url, 'JSON', (data) => {
			// Use fuse.js to fuzzy-search through protcols by title
			// Uses var to load globally
			var fuseJs = require('fuse.js');
			let searchOptions = {
			  shouldSort: true,
			  threshold: 0.6,
			  location: 0,
			  distance: 100,
			  maxPatternLength: 32,
			  minMatchCharLength: 2,
			  keys: ["title"]
			};
			let results = (new fuseJs(data, searchOptions)).search(app.getRawInput());

			if (results.length == 0) {
				// No protocols found
				speech = 'I couldn\'t find any protocols about ' + app.getRawInput() + ' on Protocat. What would you like me to do instead?';
				suggestions = ['Search Protocat again', 'Find an iGEM Part', 'Go away'];
				askWithSimpleResponseAndSuggestions(speech, suggestions)
			} else if (results.length == 1) {
				// One protocol found
				showProtocol(results[0]);
			} else {
				// Multiple protocols found
				// Shows up to 10 results in a list
				let listOptions = [];
				for(let i = 0; (i < 10 && i < results.length); i++) {
					listOptions.push({
						selectionKey: results[i].id.toString(),
						title: results[i].title,
						description: results[i].description.clean().split('.')[0],
						synonyms: [results[i].title.split(/\s+/)[0], results[i].title.split(/\s+/).slice(0,2).join(' ')]
					});
				}

				// TODO: Make this work well with devices without screens
				askWithList('Which one of these looks right?', 'Protocat results', listOptions);
			};
		});
	}

	function protocatListSelect (app) {
		// TODO: Use HTTPS
		// https://github.com/MiBioSoft2017/ProtoCat4/issues/17
		let url = 'http://protocat.org/api/protocol/' + app.getSelectedOption() + '/?format=json';

		getData(url, 'JSON', (data) => {
			// Check we actually got a protocol, and the right protocol
			if(data && data.title && data.id == app.getSelectedOption()) {
				showProtocol(data);
			} else {
				speech = 'Sorry, I couldn\'t open that protocol. What should I do instead?';
				suggestions = ['Search Protocat again', 'Find an iGEM Part', 'Go away'];
				askWithSimpleResponseAndSuggestions(speech, suggestions);
			}
		});
	}

	// Protocol must be in Protocat format
	function showProtocol (protocol) {
		// There's a lot of use of ternary operators to check if a piece of
		// data exists, as data is not guaranteed for every protocol.

		let title = protocol.title;
		let speech = '';
		speech += 'Here\'s the ' + protocol.title + '. ';
		speech += (protocol.description ? protocol.description.clean().split('.')[0] + '. ' : '');
		speech += 'Do you want a step-by-step guide, to search Protocat again or exit?'

		let text = '';
		text += (protocol.description.clean() ? '**Description:** ' + protocol.description.clean() + '  \n' : '');
		text += (protocol.materials.clean() ? '**Materials:** ' + protocol.materials.clean() + '  \n': '');
		text += (protocol.protocol_steps ? '**# Steps:** ' + protocol.protocol_steps.length + '  \n': '');
		text += '  \nData provided by Protocat';

		let destinationName = 'View on Protocat';
		// TODO: Use HTTPS
		let suggestionUrl = 'http://protocat.org/protocol/' + protocol.id.toString() + '/';
		let suggestions = ['Step-by-step guide', 'Search Protocat again', 'Exit'];

		app.setContext('protocol', 1, protocol);
		askWithBasicCardAndLinkAndSuggestions(speech, title, text, destinationName, suggestionUrl, suggestions);
	}

	const actionMap = new Map();
	actionMap.set('get_part', getPart);
	actionMap.set('protocat_search', protocatSearch);
	actionMap.set('protocat_list_select', protocatListSelect);
	app.handleRequest(actionMap);

	// All these helper methods pretty much do what they say on the tin,
	// just make it easier to create responses

	function askWithSimpleResponseAndSuggestions(speech, suggestions) {
        app.ask(app.buildRichResponse()
            .addSimpleResponse(speech)
			.addSuggestions(suggestions)
        );
    }

	function askWithLinkAndSuggestions(speech, destinationName, suggestionUrl, suggestions) {
        app.ask(app.buildRichResponse()
            .addSimpleResponse(speech)
            .addSuggestionLink(destinationName, suggestionUrl)
			.addSuggestions(suggestions)
        );
    }

    function askWithList(speech, title, options) {
        let optionItems = [];
        options.forEach(function (option) {
            optionItems.push(app.buildOptionItem(option.selectionKey, option.synonyms).setTitle(option.title).setDescription(option.description));
        });

        app.askWithList(speech, app.buildList(title).addItems(optionItems));
    }

	function askWithBasicCardAndLinkAndSuggestions(speech, title, text, destinationName, suggestionUrl, suggestions) {
		app.ask(app.buildRichResponse()
			.addSimpleResponse(speech)
			.addBasicCard(app.buildBasicCard(text)
				.setTitle(title)
				.addButton(destinationName, suggestionUrl)
			)
			.addSuggestions(suggestions)
		);
	}
});

// Gets data from a HTTP(S) source. Currently supports 'JSON' and 'xml' parsing.
function getData(url, parser, callback) {
	let requester = https;
	if (url.indexOf('http://') > -1) {
		requester = require('http');
	}
    let req = requester.get(url, (res) => {
        let data = '';
		if (parser == 'xml') {
			// If we know it's xml, we can load the library in advance for a
			// minor performance improvement. Uses var so it's defined globally
			var parseXml = require('xml2js').parseString;
		}

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
			if (parser == 'JSON') {
				callback(JSON.parse(data));
			} else if (parser == 'xml') {
				parseXml(data, function (err, result) {
	                callback(result);
	            });
			} else {
				throw new Error('Unknown parser type');
			}
        });
    }).on('error', (err) => {
		console.log('Error getting data: ', err)
		askWithSimpleResponseAndSuggestions('There was an error connecting to the database. Please try again later. What would you like to do instead?', ['Search Parts Registry', 'Search Protocat', 'Exit'])
	});
}

// Removes HTML tags, removes whitespace around string, removes trailing full stop
String.prototype.clean = function(){
	return this.replace(/<(?:.|\n)*?>/g, '').trim().replace(/\.$/, "");
};

// Useful for varying responses a bit
function randomFromArray(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}
