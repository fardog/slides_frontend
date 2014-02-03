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
		self.timeout = null;

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
		}


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
			if (self.timeout || self.slideshowRunning()) return;
			self.slideshowRunning(true);

			// hide the cursor
			$('body').css('cursor', 'none');

			// show the first slide
			self.advanceSlide();
		};


		/***
		 * stopPresentation: stops the currently running presentation
		 *
		 * returns nothing
		 */
		self.stopPresentation = function() {
			// clear the timeout
			clearTimeout(self.timeout);
			self.timeout = null;

			// if the slideshow is running, we reset things to non-running state
			if (self.slideshowRunning()) {
				self.slideshowRunning(false);
				// show the cursor again
				$('body').css('cursor', 'auto');
				// blank out the asset list
				self.assets([]);
				self.currentSlide(null);
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

			// set timeout for the next advance
			self.timeout = setTimeout(function() {
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

	// load the list of possible presentations
	view.loadData("/presentation/", {}, function(data){
		view.presentations(data.objects);
	});

	// bind our listener for setting the image height
	$(window).resize(function() {
		view.windowHeight($(window).height() + "px");
	});

	// bind our keypress handler for stopping the slideshow
	$(window).keypress(function(event) {
		if (event.which === 0) {
			view.stopPresentation();
		}
	});
});

