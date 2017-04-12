"use strict";

var wampSession = null;
var ADMIN_USER = 'adminuser';
var VIEWER_USER = 'vieweruser';
var TIME_TO_ANSWER = 40;
var TALLY_TIMEOUT = 5;
var TOAST_TIMEOUT = 4;
var FADE_FREQUENCY = 200;

angular.module('ToastedApplication', []).
run([function() {
	var wampConnection;
	
	function connectionOpen(session, details) {
		console.log("WAMP connection open.");
		wampSession = session;
	};
    
	wampConnection = new autobahn.Connection({
		url : 'ws://toasted.d13tm.com:8080/ws',
		realm : 'realm1',
		authmethods: ['anonymous']
	});
	wampConnection.onopen = connectionOpen;
	
	console.log("Connecting to wamp...");
	wampConnection.open();
}]).
controller('MainController', ['$scope', '$timeout', '$interval', function($scope, $timeout, $interval) {
	var audioPlayer = null;
	var effectsPlayer = document.createElement('audio');
	
	$scope.display = "login";
	$scope.scores = {};
	$scope.ranks = null;
	$scope.question = null;
	$scope.answers = null;
	$scope.correctAnswer = null;
	$scope.responses = null;
	$scope.providedAnswer = null;
	$scope.teamName = null;
	$scope.lastError = null;
	$scope.role = 'player';
	$scope.possiblePoints = null;
	$scope.scoresArray = null;
	var outroTimeout = null;
	var prizeMusicPlaying = false;
	$scope.checksFinished = false;
	
	$scope.displayToast = false;
	$scope.toastTeamName = null;
	$scope.toastTeamPoints = null;
	$scope.toastTeamAnswer = null;
	$scope.toastTeamCorrectAnswer = null;
	$scope.pointsRemaining = null;
	
	var pointsMultiplier = null;
	var questionStartTime = null;
	
	$scope.models = {
		loginTeamName: null,
		setQuestion: null,
		setAnswers: null,
		setCorrectAnswer: null,
		setPointsMultiplier: null,
		setTeamLeft: null,
		setTeamRight: null
	};
	
	//TODO: Figure out why Angular watches are not updating here and make corrections later if necessary, like running periodic applies.
	
	$scope.getPointsRemaining = function() {
		return (TIME_TO_ANSWER - (new Date().getTime() - questionStartTime) / 1000.0) * pointsMultiplier;
	};
	
	$scope.objLength = function(obj) {
		return Object.keys(obj).length;
	};
	
	function onToggleBlack () {
		if ($scope.role != 'viewer') {
			return;
		}
		
		$scope.$apply(function() {
			if ($scope.display == 'black') {
				$scope.display = 'scoreboard';
			}
			else {
				$scope.display = 'black';
			}
		});
	};
	
	$scope.$watch('displayToast', function(newValue, oldValue) {
		if (newValue && !oldValue) {
			if ($scope.toastTeamAnswer == null) {
				playSound('rooster.mp3');
			}		
			else if ($scope.toastTeamCorrectAnswer == $scope.toastTeamAnswer) {
				playSound('answer-correct.mp3');	
			}
			else if ($scope.toastTeamCorrectAnswer != $scope.toastTeamAnswer) {
				playSound('caroops.mp3');	
			}
		}
	});
	
	function checkWampConnected() {
		if (wampSession == null) {
			$timeout(checkWampConnected, 1000);  //Keep trying to see if there is a connection.
		}
		else {
    		wampSession.call('f_get_current_scores').then(currentScoresReceived);
    		wampSession.subscribe('c_questions', onQuestion);
    		wampSession.subscribe('c_scores', onScores);
    		wampSession.subscribe('c_display_answers', onDisplayAnswer);
    		wampSession.subscribe('c_display_images', onDisplayImage);
    		wampSession.subscribe('c_intro', onPlayIntro);
    		wampSession.subscribe('c_outro', onPlayOutro);
    		wampSession.subscribe('c_toggle_black', onToggleBlack);
    		wampSession.subscribe('c_prize_music', onPrizeMusic);
    		
    		var teamName = localStorage.getItem("teamName");
    		
    		if (teamName) {
    			$scope.models.loginTeamName = teamName;
    			$scope.login();
    		}
    		else {
    			$scope.checksFinished = true;
    		}
		}
	};
	
	function setPointsRemaining() {
		var calcPointsRemaining = $scope.getPointsRemaining();
		if (calcPointsRemaining < 0) {
			$scope.pointsRemaining = 0;
		}
		else {
			$scope.pointsRemaining = $scope.getPointsRemaining();
			$timeout(setPointsRemaining, 100);
		}
	}
	
	function currentScoresReceived(scores) {
		console.log("Current scores received.")
		$scope.$apply(function() {
			$scope.scores = scores;
			computeScoreArrays();
		});
	};
	
	function fadeOut(nochange) {
		if (audioPlayer == null) {
			return;
		}
		
		if (audioPlayer.volume > 0.05) {
			audioPlayer.volume = audioPlayer.volume - .05;
			$timeout(fadeOut, FADE_FREQUENCY);
		}
		else {
			audioPlayer.pause();
			audioPlayer = null;
			$scope.$apply(function() {
				if (nochange !== undefined) {
					$scope.display = 'scoreboard';
				}
			});
		}
	}
	
	function computeScoreArrays() {
		$scope.scoresArray = getScoresArray();
		$scope.ranks = getRanks($scope.scoresArray);
	};
	
	function fadeIn() {
		if (audioPlayer == null) {
			return;
		}
		
		if (audioPlayer.volume < 0.95) {
			audioPlayer.volume = audioPlayer.volume + .05;
			$timeout(fadeIn, FADE_FREQUENCY);
		}
		else {
			audioPlayer.volume = 1;
		}
	}
	
	function playSound(filename, startTime, volume) {
		effectsPlayer.setAttribute('src', filename);
		effectsPlayer.load();
		if (volume === undefined) {
			volume = 1;
		}		
		effectsPlayer.volume = volume;
		if (startTime !== undefined) {
			effectsPlayer.currentTime = startTime;
		}		
		effectsPlayer.play();
	};
	
	function onPrizeMusic(data) {
		if ($scope.role != 'viewer') {
			return;
		}
		
		console.log("Found prize music.");
		
		$scope.$apply(function() {
			if (!prizeMusicPlaying) {
				audioPlayer = document.createElement('audio');
				audioPlayer.setAttribute('src', 'prize.flac');
				audioPlayer.load();
				audioPlayer.volume = 1;
				audioPlayer.currentTime = 130;
				audioPlayer.play();
				prizeMusicPlaying = true;
			}
			else {
				fadeOut(true);
				prizeMusicPlaying = false;
			}
		});
	};
	
	function onPlayIntro(data) {
		if ($scope.role != 'viewer') {
			return;
		}
		
		$scope.$apply(function() {
			if ($scope.display != 'intro') {
				$scope.display = 'intro';
				audioPlayer = document.createElement('audio');
				audioPlayer.setAttribute('src', 'intro.flac');
				audioPlayer.load();
				audioPlayer.volume = 1;
				audioPlayer.play();
			}
			else {
				fadeOut();
			}
		});
	};
	
	function onPlayOutro(data) {
		if ($scope.role != 'viewer') {
			return;
		}
		
		$scope.$apply(function() {
			if (outroTimeout == null) {
				outroTimeout = $timeout(function() {
					$scope.$apply(function() {
						$scope.display = 'intro';
					});
				}, 25000);				
				audioPlayer = document.createElement('audio');
				audioPlayer.setAttribute('src', 'outro.flac');
				audioPlayer.load();
				audioPlayer.volume = 0;
				audioPlayer.currentTime = 170;
				audioPlayer.play();
				fadeIn();
			}
			else {
				audioPlayer.pause();
				audioPlayer = null;
				$scope.display = 'black';
				$timeout.cancel(outroTimeout);
				outroTimeout = null;
			}
		});
	};
	
	function onQuestion(data) {
		if ($scope.teamName != null) {
			//Not sure why this is needed here.
			$scope.$apply(function(){
				$scope.question = data[0];
				pointsMultiplier = data[1];
				$scope.answers = data[2];
				questionStartTime = data[3] * 1000.0;
				$scope.display = 'question';
				setPointsRemaining();
				
				if ($scope.role == 'viewer') {
					playSound('question-countdown.flac', 242, 0.65);
				}
				
				console.log("Question received!");
			});
		}
	};
	
	function onScores(data) {
		$scope.scores = data[0];
		computeScoreArrays();
		
		$scope.$apply(function() {
			$scope.inTally = true;
			$scope.correctAnswer = data[1];
			if ($scope.teamName != null && $scope.role == 'player') {
				$scope.display = 'toast';
				$scope.toastTeamCorrectAnswer = $scope.correctAnswer;
				$scope.toastTeamAnswer = $scope.providedAnswer;
				$scope.toastTeamName = $scope.teamName;
				$scope.toastTeamPossiblePoints = $scope.possiblePoints;
				$scope.displayToast = true;
			}
		});
		
		$timeout(function() {
			$scope.$apply(function() {
				$scope.display = 'scoreboard';
				$scope.correctAnswer = null;
				$scope.providedAnswer = null;
				$scope.question = null;
				$scope.answers = null;
				$scope.possiblePoints = null;
				$scope.displayToast = false;
				$scope.toastDisplay = null;
				$scope.toastTeamName = null;
				$scope.toastTeamAnswer = null;
				$scope.toastTeamCorrectAnswer = null;
				$scope.toastTeamPossiblePoints = null;
				questionStartTime = null;
				pointsMultiplier = null;
				$scope.inTally = false;
			});
		}, TALLY_TIMEOUT * 1000.0);
		console.log("Scores tallied!");
	};
	
	function onDisplayAnswer(data) {
		if ($scope.role != 'viewer') {
			return;
		}
						
		var teamName = data[0];
		console.log("Display answer received for team " + teamName + "!");
		
		wampSession.call('f_get_team_answer', [teamName]).then(function(data) {
			$scope.$apply(function() {
				$scope.display = 'toast';
				$scope.toastTeamName = teamName;
				$scope.toastTeamAnswer = data[0];
				$scope.toastTeamCorrectAnswer = data[1];
				$scope.toastTeamPossiblePoints = data[2];
			});
		});
	}
	
	function onDisplayImage(data) {
		if ($scope.role != 'viewer') {
			return;
		}		
		
		console.log("Display image received!");
		
		if ($scope.toastTeamName == null) {
			//$scope.lastError = "Click display answer first.";
			return;
		}
		
		var teamName = data[0];
		
		$scope.$apply(function() {
			$scope.displayToast = true;	
		});
		
		$timeout(function() {
			$scope.$apply(function() {
				$scope.display = 'question';
				$scope.displayToast = false;
				$scope.toastDisplay = null;
				$scope.toastTeamName = null;
				$scope.toastTeamAnswer = null;
				$scope.toastTeamCorrectAnswer = null;
				$scope.toastTeamPossiblePoints = null;
			});
		}, TOAST_TIMEOUT * 1000.0);
	};
	
	//This is used for instances where Angular needs an array of Objects for sorting.
	function getScoresArray() {
		var scoresArray = [];
		
		for (var key in $scope.scores) {
			scoresArray.push({'teamName' : key, 'score': $scope.scores[key]});
		}
		
		//Sorts in descending order.
		scoresArray.sort(function(a, b) {
			return b.score - a.score;
		});
		
		return scoresArray;
	};
	
	//Create ranks, with allocation for ties.
	function getRanks(scoresArray) {
		var ranks = {};
		
		var lastScore = null;
		var lastRank = null;
		
		for (var i = 0; i < scoresArray.length; i++) {
			if (lastScore == scoresArray[i].score) {
				ranks[scoresArray[i].teamName] = lastRank;
			}
			else {
				ranks[scoresArray[i].teamName] = i + 1;
				lastRank = i + 1;
				lastScore = scoresArray[i].score;
			}
		}
		
		return ranks;
	};
	
	$scope.login = function() {
		wampSession.call('f_get_insensitive_team_name', [$scope.models.loginTeamName]).then(function(teamName) {
			$scope.$apply(function() {
				if (teamName == null) {
					$scope.teamName = $scope.models.loginTeamName;
				}
				else {
					$scope.teamName = teamName;
				}
				
				$scope.display = "scoreboard";
				if ($scope.teamName == ADMIN_USER) {
					$scope.role = 'admin';
				}
				else if ($scope.teamName == VIEWER_USER) {
					$scope.role = 'viewer';
				}
				
				localStorage.setItem("teamName", $scope.teamName);
				$scope.checksFinished = true;
			});
		});
	};
	
	$scope.logout = function() {
		localStorage.removeItem("teamName");
		$scope.teamName = null;
		$scope.display = 'login';
	};
	
	$scope.playIntro = function() {
		if ($scope.role != 'admin') {
			return;
		}
		
		wampSession.publish('c_intro', ["toggle"]);
	};
	
	$scope.playOutro = function() {
		if ($scope.role != 'admin') {
			return;
		}
		
		wampSession.publish('c_outro', ["toggle"]);
	};
	
	$scope.submitAnswer = function(answer) {
		if ($scope.role != 'player') {
			return;
		}
		
		wampSession.call('f_answer_question', [$scope.teamName, answer]).then(function(possiblePoints) {
			$scope.$apply(function() {
				$scope.display = 'answered';
				$scope.possiblePoints = possiblePoints;
				$scope.providedAnswer = answer;
			});
		});
	};
	
	$scope.displayAnswer = function(teamName) {
		wampSession.publish('c_display_answers', [teamName]);
	};
	
	$scope.displayImage = function(teamName) {
		wampSession.publish('c_display_images', [teamName]);
	};
	
	$scope.setQuestion = function() {
		wampSession.call('f_set_question', [$scope.models.setQuestion, $scope.models.setPointsMultiplier, $scope.models.setAnswers.split("|"), $scope.models.setCorrectAnswer]).then(function() {
			$scope.lastError = null;
		}, function(err) {
			$scope.lastError = err;
		});
	};
	
	$scope.tallyAnswers = function() {
		wampSession.call('f_tally_answers');
	};
	
	$scope.triggerToggleBlack = function() {
		wampSession.publish('c_toggle_black');
	};
	
	$scope.playPrizeMusic = function() {
		wampSession.publish('c_prize_music');
	};
		
	checkWampConnected();
}]);
