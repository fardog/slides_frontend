// money variables in the global scope, since we use them in our KO data-binds
var $media = null,
		$prefix = null,
		$base = null;

$(document).ready(function() {

	// initialize Zurb Foundation
	$(document).foundation();

	// we store some variable properties in the HTML, get them.
	$media = $("meta[property='slides:media']").attr("content");
	$prefix = $("meta[property='slides:api']").attr("content");
	$base = document.baseURI;


	/***
	 * viewModel: our bound object for KnockoutJS
	 */
	var viewModel = function() {
		var self = this;

		// utility function for loading data
		self.loadData = function(url, params, next) {
			$.get($prefix + url, params, function(data, textStatus, jqXHR) {
				next(data);
			}).fail(function (data) {
				// TODO handle failures better
				console.log("Failed to load data.");
				console.log(data);
			});
		};


		// list of presentations that were loaded from the server
		self.presentations = ko.observableArray([]);
		// list of assets (slides) in the currently running presentation
		self.assets = ko.observableArray([]);
		// the currently displayed slide
		self.currentSlide = ko.observable(null);
		// whether or not the slideshow is running
		self.slideshowRunning = ko.observable(null);
		// the current window height in pixels
		self.windowHeight = ko.observable($(window).height() + "px");
		// the timer that advances to the next slide
		self.slideTimeout = null;
		// the timer that updates the currently running presentation
		self.assetUpdateInterval = null;
		self.assetUpdateFrequency = 0.25 * 60 * 1020; // every 15-ish seconds
		self.assetUpdateURI = null;
		self.assetLastModified = null;

		// the timer that updates the currently display, if used
		self.display = null;
		self.displayUpdateInterval = null;
		self.displayUpdateFrequency = 0.25 * 60 * 1000; // every 15 seconds
		self.displayUpdateURI = null;
		self.displayLastModified = null;

		/***
		 * loadPresentation: fired when a presentation is selected, loads the 
		 * 	image assets into the visible array, and starts the slideshow.
		 *
		 * data - the current presentation
		 * event - the event (click) that caused it to load
		 * 
		 * returns nothing
		 */
		self.loadPresentation = function(data, event) {
			// save the resource_uri and last modification for later updating
			self.assetUpdateURI = data.resource_uri;
			self.assetLastModified = data.last_modified;

			// put a visibility marker on each slide
			for (var i=0; i<data.assets.length; i++) {
				data.assets[i].visible = ko.observable(false);
			}

			// if we have a current slide marked, make that one visible
			if (self.currentSlide()) {
				data.assets[self.currentSlide()].visible(true);
			}
			// load the assets into the array
			self.assets(data.assets);

			// start the slideshow if it's not running.
			if (!self.slideshowRunning()) {
				self.startPresentation();
			}
		};


		/***
		 * checkPresentationUpdateNeeded: checks a newly-fetched presentation 
		 *  against the currently loaded one, and updates if necessary
		 *
		 * data - the newly-fetched presentation
		 *
		 * returns nothing
		 */
		self.checkPresentationUpdateNeeded = function(data) {
			// first, we see if the presentation itself has a new modification date
			if (data.last_modified !== self.assetLastModified) {
				// update needed
				self.stopPresentation();
				self.loadPresentation(data, null);
				return;
			}

			// now we need to check each asset's last modification, and update
			for(var i=0; i<data.assets.length; i++) {
				if(data.assets[i].asset.last_modified !== 
						self.assets()[i].asset.last_modified) {
					// update needed
					self.stopPresentation();
					self.loadPresentation(data, null);
					return;
				}
			}

			// otherwise no update is needed, and we just fall through
		};


		/***
		 * loadDisplay: when running automatically via the display API, this 
		 *  function takes a display object and loads that presentation
		 *
		 * data - the display object loaded from the API
		 *
		 * returns nothing
		 */
		self.loadDisplay = function(data) {
			// save our URIs for later loading/comparison
			self.displayUpdateURI = data.resource_uri;
			self.displayLastModified = data.last_modified;

			// load the presentation data directly
			self.loadData(data.presentation, {}, function(data) {
				self.loadPresentation(data);
			});

			// clear the interval just in case it's running
			clearInterval(self.displayUpdateInterval);
			self.displayUpdateInterval = null;

			// start looking to see if this display's presentation has changed
			self.displayUpdateInterval = setInterval(function() {
				// update the display data
				self.loadData(self.displayUpdateURI, {}, function(data) {
					// if we see a new modification date, we need to change presentations
					if(self.displayLastModified !== data.last_modified) {
						self.stopPresentation();
						self.loadDisplay(data);
					}
				});
			}, self.displayUpdateFrequency);
		};


		/***
		 * startPresentation: starts the currently loaded presentation
		 *
		 * returns nothing
		 */
		self.startPresentation = function() {
			// set the current slide to -1, so we fade in the first slide
			self.currentSlide(-1);

			// if there's a slideshow running, stop it
			self.stopPresentation();

			// mark the slideshow as running. bail if there's one running already
			if (self.slideTimeout || self.slideshowRunning()) return;
			self.slideshowRunning(true);

			// hide the cursor
			$('body').css('cursor', 'none');

			// start the asset update timer
			self.assetUpdateInterval = setInterval(function() {
				self.loadData(self.assetUpdateURI, {}, self.checkPresentationUpdateNeeded);
			}, self.assetUpdateFrequency);

			// show the first slide
			self.advanceSlide();
		};


		/***
		 * stopPresentation: stops the currently running presentation
		 *
		 * returns nothing
		 */
		self.stopPresentation = function() {
			// clear the slide timeout
			clearTimeout(self.slideTimeout);
			self.slideTimeout = null;

			// stop the asset update timeout
			clearTimeout(self.assetUpdateInterval);
			self.assetUpdateInterval = null;

			// if the slideshow is running, we reset things to non-running state
			if (self.slideshowRunning()) {
				self.slideshowRunning(false);
				// show the cursor again
				$('body').css('cursor', 'auto');
				// blank out the asset list
				self.assets([]);
				self.currentSlide(null);
				self.assetUpdateURI = null;
			}
		};


		/***
		 * advanceSlide: advances the currently running slideshow to the next slide
		 *
		 * returns nothing
		 */
		self.advanceSlide = function() {
			// the next slide should be one after the current
			var nextSlide = self.currentSlide() + 1;
			// if we've overrun the end of the assets though, go back to the beginning
			if (nextSlide >= self.assets().length) nextSlide = 0;

			// special case for the first slide, since we set -1 above
			if (self.currentSlide() >= 0)
				self.assets()[self.currentSlide()].visible(false);

			// make the next slide visible, and set it as current slide
			self.assets()[nextSlide].visible(true);
			self.currentSlide(nextSlide);

			// set timeout for the next advance, unless it's a looper
			if (self.assets()[nextSlide].loop) return;

			self.slideTimeout = setTimeout(function() {
				if (self.slideshowRunning()) self.advanceSlide();
			}, self.assets()[self.currentSlide()].time * 1000);
		};
	}; /* end viewModel */


	// create a binding handler for a fade transition
	ko.bindingHandlers.visibleFade = {
		init: function(element, valueAccessor) {
			var value = valueAccessor();
			$(element).toggle(value());
		},
		update: function(element, valueAccessor) {
			var value = valueAccessor();
			value() ? $(element).fadeIn(1000) : $(element).fadeOut(1000);
		}
	}

	// apply our view bindings
	var view = new viewModel();
	ko.applyBindings(view);

	// see if we were given a specific display name
	if(location.hash.length > 0) {
		var hash = location.hash.replace('#', '');
		var parameters = hash.split('=');
		if (parameters[0] === 'display' && parameters[1].length > 0) {
			view.display = parameters[1];
		}
	}
	
	// if we have a display parameter, we can try to get that display's pres.
	if(view.display) {
		view.loadData("/api/v1/display/", {slug: view.display}, function(data) {
			if(data.objects[0].presentation.length > 0)
				view.loadDisplay(data.objects[0]);
		});
	}
	// if we don't have a display parameter, load a list of presentations
	else {
		// load the list of possible presentations
		view.loadData("/api/v1/presentation/", {}, function(data){
			view.presentations(data.objects);
		});

		// only bind our key handler for stopping the slideshow if we have a list
		$(window).keyup(function(event) {
			if (event.which === 27) { // 27 is "Escape"
				view.stopPresentation();
			}
		});
	}

	// bind our listener for setting the image height
	$(window).resize(function() {
		view.windowHeight($(window).height() + "px");
	});
});

