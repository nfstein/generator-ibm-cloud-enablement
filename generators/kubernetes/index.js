/*
 © Copyright IBM Corp. 2017, 2018
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
const Handlebars = require('../lib/handlebars.js');
const Utils = require('../lib/utils');

// suffix for other deployment
const DEPLOYMENT_SUFFIX = '.deploy.yaml';

// list of supporting services
const supportingServicesTypes = ['mongodb'];

// storage directory
const SERVICE_DIR = 'services/';

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
			chart: {source : 'Chart.yaml', target : 'chartDir/Chart.yaml', process: true},
			deployment: {source : 'deployment.yaml', target : 'chartDir/templates/deployment.yaml', process: true},
			service: {source : 'service.yaml', target : 'chartDir/templates/service.yaml', process: false},
			serviceKnative: {source : 'service-knative.yaml', target : '.bluemix/service-knative.yaml', process: true},
			hpa: {source : 'hpa.yaml', target : 'chartDir/templates/hpa.yaml', process: true},
			istio: {source : 'istio.yaml', target : 'chartDir/templates/istio.yaml', process: true},
			basedeployment: {source : 'basedeployment.yaml', target : 'chartDir/templates/basedeployment.yaml', process: true},
			values: {source : 'values.yaml', target : 'chartDir/values.yaml', process: true}
		};
	}

	configuring() {
		// work out app name and language
		this.opts.language = _.toLower(this.bluemix.backendPlatform);
		if(this.opts.language === 'java' || this.opts.language === 'spring') {
			this.opts.applicationName = this.opts.appName || Utils.sanitizeAlphaNum(this.bluemix.name);
		} else {
			this.opts.applicationName = Utils.sanitizeAlphaNum(this.bluemix.name);
		}

		this.opts.chartName = Utils.sanitizeAlphaNumLowerCase(this.opts.applicationName);

		this.opts.services = typeof(this.opts.services) === 'string' ? JSON.parse(this.opts.services || '[]') : this.opts.services;

		this.opts.servicePorts = {};
		//use port if passed in
		if(this.opts.port) {
			this.opts.servicePorts.http = this.opts.port;
		} else {
			this.opts.servicePorts.http = portDefault[this.opts.language].http;
			if(portDefault[this.opts.language].https) {
				this.opts.servicePorts.https = portDefault[this.opts.language].https;
			}
		}

		this.opts.repositoryURL='';
		if (this.bluemix.server) {
			const registryNamespace = this.bluemix.server && this.bluemix.server.cloudDeploymentOptions && this.bluemix.server.cloudDeploymentOptions.imageRegistryNamespace ?
				this.bluemix.server.cloudDeploymentOptions.imageRegistryNamespace : 'replace-me-namespace';
			this.opts.registryNamespace = registryNamespace;
			this.opts.repositoryURL= `icr.io/${registryNamespace}/`;
			this.opts.kubeClusterNamespace =
				this.bluemix.server && this.bluemix.server.cloudDeploymentOptions && this.bluemix.server.cloudDeploymentOptions.kubeClusterNamespace ?
					this.bluemix.server.cloudDeploymentOptions.kubeClusterNamespace : 'default';
			if (this.bluemix.server.cloudDeploymentOptions && this.bluemix.server.cloudDeploymentOptions.kubeDeploymentType) {
				this.opts.kubeDeploymentType = this.bluemix.server.cloudDeploymentOptions.kubeDeploymentType;
				if (Utils.sanitizeAlphaNumLowerCase(this.bluemix.server.cloudDeploymentOptions.kubeDeploymentType) === 'helm') {
					delete this.fileLocations.serviceKnative; // remove knative service yaml file when not needed
				}
			}
		} else {
			// TODO(gib): we seem to be hitting this, not sure how.

			// if --bluemix specified and dockerRegistry is not
			if (this.bluemix.dockerRegistry === undefined) {
				this.opts.repositoryURL= 'registry.ng.bluemix.net/replace-me-namespace/';
			}
			else {
				// dockerRegistry was passed in --bluemix or was
				// set via prompt response
				this.opts.repositoryURL = this.bluemix.dockerRegistry + '/';
			}
		}
	}

	writing() {
		//skip writing files if platforms is specified via options and it doesn't include kube
		if(this.opts.platforms && !this.opts.platforms.includes('kube')) {
			return;
		}
		// setup output directory name for helm chart
		// chart/<applicationName>/...
		let chartDir = 'chart/' + this.opts.chartName;

		if (this.opts.language === 'java' || this.opts.language === 'spring') {
			this.fileLocations.deployment.source = 'java/deployment.yaml';
			this.fileLocations.basedeployment.source = 'java/basedeployment.yaml';
			this.fileLocations.service.source = 'java/service.yaml';
			this.fileLocations.service.process = true;
			this.fileLocations.values.source = 'java/values.yaml';

		}
		// iterate over file names
		let files = Object.keys(this.fileLocations);
		files.forEach(file => {
			let source = this.fileLocations[file].source;
			let target = this.fileLocations[file].target;
			if(target.startsWith('chartDir')) {
				target = chartDir + target.slice('chartDir'.length);
			}
			if(this.fileLocations[file].process) {
				this._writeHandlebarsFile(source, target, this.opts);
			} else {
				this.fs.copy(
					this.templatePath(source),
					this.destinationPath(target)
				);
			}
		});

		if(this.opts.services){
			this.opts.services.forEach(service => {
				if(_.includes(supportingServicesTypes, service)){
					this._writeHandlebarsFile(SERVICE_DIR + service + DEPLOYMENT_SUFFIX, chartDir + '/templates/' + service + DEPLOYMENT_SUFFIX, {});
				} else {
					console.error(service + ' is not supported');
				}
			})
		}
	}

	_writeHandlebarsFile(templateFile, destinationFile, data) {
		let template = this.fs.read(this.templatePath(templateFile));
		let compiledTemplate = Handlebars.compile(template);
		let output = compiledTemplate(data);
		this.fs.write(this.destinationPath(destinationFile), output);
	}
};
