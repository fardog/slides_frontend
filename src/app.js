var $media = null;

$(document).ready(function() {

	// initialize Foundation
	$(document).foundation();

	var $prefix = $("meta[property='slides:api']").attr("content");
	var $base = document.baseURI;
	$media = $("meta[property='slides:media']").attr("content");

	/***
	 * viewModel: an our bound object for KnockoutJS
	 */
	var viewModel = function() {
		var self = this;

		// utility function for loading data
		self.loadData = function(url, params, next) {
			$.get($prefix + url, params, function(data, textStatus, jqXHR) {
				next(data);
			}).fail(function (data) {
				console.log("Failed to load data.");
				console.log(data);
			});
		};


		self.presentations = ko.observableArray();
		self.assets = ko.observableArray();
		self.currentSlide = ko.observable();
		self.slideshowRunning = ko.observable(null);
		self.windowHeight = ko.observable($(window).height() + "px");

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
			// set visibility on each slide
			data.assets[0].visible = ko.observable(true);
			for (var i=1; i<data.assets.length; i++) {
				data.assets[i].visible = ko.observable(false);
			}
			self.assets(data.assets);

			// set the current slide
			self.currentSlide(0);

			// if there's a slideshow running, stop it
			self.stopPresentation();

			// start the next slideshow
			self.slideshowRunning(true);
			$('body').css('cursor', 'none'); // hide cursor
			setTimeout(function() {
				self.advanceSlide();
			}, self.assets()[self.currentSlide()].time * 1000);
		};

		/***
		 * stopPresentation: stops the currently running presentation
		 *
		 * returns nothing
		 */
		self.stopPresentation = function() {
			if (self.slideshowRunning()) {
				self.slideshowRunning(false);
				$('body').css('cursor', 'auto'); // show cursor again
				self.assets([]);
			}
		};

		/***
		 * advanceSlide: advances the currently running slideshow to the next slide
		 *
		 * returns nothing
		 */
		self.advanceSlide = function() {
			var length = self.assets().length;
			var nextSlide = self.currentSlide() + 1;
			if (nextSlide >= length) nextSlide = 0;
			self.assets()[self.currentSlide()].visible(false);
			self.assets()[nextSlide].visible(true);
			self.currentSlide(nextSlide);
			setTimeout(function() {
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
		if (event.which == 0) {
			view.stopPresentation();
		}
	});
});

