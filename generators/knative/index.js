/*
 © Copyright IBM Corp. 2017, 2019
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

'use strict';

const Generator = require('yeoman-generator');
let _ = require('lodash');
const Handlebars = require('../lib/handlebars');
const Utils = require('../lib/utils');

const portDefault = {
	java: {
		http: '9080',
		https: '9443'
	},
	spring: {
		http: '8080'
	},
	node: {
		http: '3000'
	},
	python: {
		http: '3000'
	},
	swift: {
		http: '8080'
	},
	django: {
		http: '3000'
	},
	go: {
		http: '8080'
	}
}

module.exports = class extends Generator {

	constructor(args, opts) {
		super(args, opts);

		if (typeof (opts.bluemix) === 'string') {
			this.bluemix = JSON.parse(opts.bluemix || '{}');
		} else {
			this.bluemix = opts.bluemix;
		}

		if(typeof (opts) === 'string'){
			this.opts = JSON.parse(opts || '{}');
		} else {
			this.opts = opts.cloudContext || opts;
		}
	}


	initializing() {
		this.fileLocations = {
			serviceKnative: {source : 'service.yaml', target : './service.yaml', process: true},
		};
	}

	configuring() {}

	writing() {

		// iterate over file names
		let files = Object.keys(this.fileLocations);
		files.forEach(file => {
			let source = this.fileLocations[file].source;
			let target = this.fileLocations[file].target;

			if(this.fileLocations[file].process) {
				this._writeHandlebarsFile(source, target, this.opts);
			} else {
				this.fs.copy(
					this.templatePath(source),
					this.destinationPath(target)
				);
			}
		});
	}

	_writeHandlebarsFile(templateFile, destinationFile, data) {
		let template = this.fs.read(this.templatePath(templateFile));
		let compiledTemplate = Handlebars.compile(template);
		let output = compiledTemplate(data);
		this.fs.write(this.destinationPath(destinationFile), output);
	}
};
