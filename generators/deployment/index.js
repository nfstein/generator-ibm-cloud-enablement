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

const Handlebars = require('../lib/handlebars.js');
const Generator = require('yeoman-generator');
const Utils = require('../lib/utils');

module.exports = class extends Generator {
	constructor(args, opts) {
		super(args, opts);
		if (opts.cloudContext) {
			this.opts = opts.cloudContext
			this.opts.libertyVersion = opts.libertyVersion
		} else {
			this.opts = opts
		}
		if (typeof (opts.bluemix) === 'string') {
			this.bluemix = JSON.parse(opts.bluemix || '{}');
		} else if (typeof (opts.bluemix) === 'object') {
			this.bluemix = opts.bluemix;
		}

	}

	configuring() {
		this.manifestConfig = {};
		this.manifestConfig.env = {};
		this.toolchainConfig = {};
		this.pipelineConfig = {
			buildJobProps: {
				artifact_dir: "''"
			},
			triggersType: 'commit'
		};
		this.deployment = {
			type: 'CF',
			name: this.bluemix.name,
			language: this.bluemix.backendPlatform
		};

		this.name = undefined;
		if (this.bluemix.server) {
			this.name = this.bluemix.server.name;
			this.manifestConfig = Object.assign(this.manifestConfig, this.bluemix.server);
			this.deployment = Object.assign(this.deployment, this.bluemix.server.cloudDeploymentOptions);
			this.manifestConfig.instances = this.manifestConfig.instances || '1';
			this.deployment.type = this.bluemix.server.cloudDeploymentType || 'CF';
			this.deployment.chartName = Utils.sanitizeAlphaNumLowerCase(this.name || this.bluemix.name);
			this.deployment.scriptsDir = '.bluemix/scripts';
			this.deployment.hasMongo = this.opts.createType === 'mern' || this.opts.createType === 'mean';
			if (!this.deployment.kubeClusterNamespace) {
				this.deployment.kubeClusterNamespace = 'default';
			}
			if (!this.deployment.imageRegistryNamespace) {
				this.deployment.imageRegistryNamespace = 'my_registry_ns';
			}
		} else {
			this.name = this.bluemix.name;
			this.manifestConfig.name = this.bluemix.name;
			this.deployment.type = this.bluemix.cloudDeploymentType || 'CF';
		}

		this.toolchainConfig.repoType = this.opts.repoType || "clone";
		switch (this.bluemix.backendPlatform) {
			case 'NODE':
				this._configureNode();
				break;
			case 'SWIFT':
				this._configureSwift();
				break;
			case 'JAVA':
				this._configureLiberty();
				this._configureJavaCommon();
				break;
			case 'SPRING':
				this._configureJavaCommon();
				this._configureSpring();
				break;
			case 'PYTHON':
				this._configurePython();
				break;
			case 'DJANGO':
				this._configureDjango();
				break;
			case 'GO':
				this._configureGo();
				break;
			default:
				throw new Error(`Language ${this.bluemix.backendPlatform} was not one of the valid languages: NODE, SWIFT, JAVA, SPRING, DJANGO, PYTHON, or GO`);
		}
		if (this.manifestConfig && this.manifestConfig.ignorePaths) {
			this.cfIgnoreContent = this.cfIgnoreContent.concat(this.manifestConfig.ignorePaths);
		}

		this.pipelineConfig.postBuildScript = this.fs.read(this.templatePath('post_build.txt'));

		if (this.pipelineConfig.buildJobProps && this.pipelineConfig.buildJobProps.script) {
			this.pipelineConfig.buildJobProps.script += '\n\n' + this.pipelineConfig.postBuildScript;
		} else if (!this.pipelineConfig.buildJobProps.script) {
			Object.assign(this.pipelineConfig.buildJobProps, {
				build_type: 'shell',
				script: '|-\n' +
				'      #!/bin/bash\n' +
				this.pipelineConfig.postBuildScript
			});
		}
	}

	/***
	 * Get the highest memory size available
	 *
	 * @params manifestMemoryConfig {string} the memory allocaated h
	 */
	_getHighestMemorySize(manifestMemoryConfig, userDefinedMinMemory){
		if(!userDefinedMinMemory) {
			return manifestMemoryConfig;
		} else if (!manifestMemoryConfig && userDefinedMinMemory) {
			return userDefinedMinMemory;
		}

		const memMap = {
			k: 1,
			m: 2,
			g: 3
		};
		const manifestSize = manifestMemoryConfig.replace(/[^MmGgKk]/g, '');
		const userDefinedMinSize = userDefinedMinMemory.replace(/[^MmGgKk]/g, '');
		let highestAvailableSize;

		if(memMap[manifestSize.toLowerCase()] > memMap[userDefinedMinSize.toLowerCase()]){
			highestAvailableSize = manifestMemoryConfig;
		} else if (memMap[manifestSize.toLowerCase()] < memMap[userDefinedMinSize.toLowerCase()]){
			highestAvailableSize = userDefinedMinMemory;
		} else {
			const manifestValue = parseInt(manifestSize.replace(/[M,m,G,g,K,k]/g, ''));
			const definedValue = parseInt(userDefinedMinSize.replace(/[M,m,G,g,K,k]/g, ''));

			highestAvailableSize = manifestValue > definedValue ? manifestMemoryConfig : userDefinedMinMemory;
		}

		return highestAvailableSize;
	}

	_configureNode() {
		this.manifestConfig.buildpack = 'sdk-for-nodejs';
		this.manifestConfig.command = 'npm start';
		this.manifestConfig.memory = this._getHighestMemorySize(this.manifestConfig.memory, this.opts.nodeCFMinMemory);
		this.cfIgnoreContent = ['.git/', 'node_modules/', 'test/', 'vcap-local.js'];
	}

	_configureGo() {
		// Need a direct github link becasue 'go_buildpack' doesn't have dep support
		this.manifestConfig.buildpack = 'https://github.com/cloudfoundry/go-buildpack.git#v1.8.25';
		this.manifestConfig.command = undefined;
		this.manifestConfig.memory = this.manifestConfig.memory || '128M';
		this.manifestConfig.env.GOPACKAGENAME = this.bluemix.sanitizedName;
		this.cfIgnoreContent = ['.git/', 'vendor/'];
	}

	_configureSwift() {
		this.manifestConfig.buildpack = 'swift_buildpack';
		this.manifestConfig.command = this.bluemix.name ? ("\"'" + `${this.bluemix.name}` + "'\"") : undefined;
		this.manifestConfig.memory = this.manifestConfig.memory || '128M';
		this.pipelineConfig.swift = true;
		this.cfIgnoreContent = ['.build/*', '.build-ubuntu/*', 'Packages/*'];
	}

	_configureJavaCommon() {
		if (this.opts.appName) {
			this.manifestConfig.name = this.opts.appName;
			this.name = this.opts.appName;
		}
		if (this.opts.createType === 'bff/liberty') {
			this.manifestConfig.env.OPENAPI_SPEC = `/${this.name}/swagger/api`;
		}
		if (this.opts.createType === 'bff/spring') {
			this.manifestConfig.env.OPENAPI_SPEC = '/swagger/api';
		}

		if (this.opts.createType && this.opts.createType.startsWith('enable/')) {
			this.toolchainConfig.repoType = 'link';
		}
		let buildCommand = this.opts.buildType === 'gradle' ? '      gradle build' : '      mvn -N io.takari:maven:wrapper -Dmaven=3.5.0\n      ./mvnw install -DskipTests' ;
		this.pipelineConfig.javaBuildScriptContent = 'export JAVA_HOME=$JAVA8_HOME\n' + buildCommand;
		this.pipelineConfig.buildJobProps = {
			build_type: 'shell',
			script: '|\n' +
			'      #!/bin/bash\n' +
			'      ' + this.pipelineConfig.javaBuildScriptContent
		};
	}

	_configureLiberty() {
		let artifactId = this.opts.artifactId ? this.opts.artifactId : "java-liberty";
		let version = this.opts.version ? this.opts.version : "1.0-SNAPSHOT";
		
		this.cfIgnoreContent = ['/.classpath', '/.project', '/.settings', '/src/main/liberty/config/server.env', 'target/', 'build/'];
		this.manifestConfig.buildpack = 'liberty-for-java';
		this.manifestConfig.memory = this.manifestConfig.memory || '512M';
		let buildDir = (this.opts.buildType && this.opts.buildType === 'gradle') ? 'build' : 'target';
		let zipPath = `${buildDir}/` + artifactId + `-` + version + `.zip`;
		console.log ("**** zippath " + zipPath)
		this.manifestConfig.path = `./${zipPath}`;
		let excludes = [];
		if (this.opts.libertyVersion === 'beta') {
			this.manifestConfig.env.IBM_LIBERTY_BETA = 'true'
			this.manifestConfig.env.JBP_CONFIG_LIBERTY = '\"version: +\"'
		}
		if (this.bluemix.cloudant) {
			excludes.push('cloudantNoSQLDB=config');
		}
		if (this.bluemix.objectStorage) {
			excludes.push('Object-Storage=config');
		}
		if (excludes.length === 1) {
			this.manifestConfig.env.services_autoconfig_excludes = excludes[0];
		}
		if (excludes.length === 2) {
			this.manifestConfig.env.services_autoconfig_excludes = excludes[0] + ' ' + excludes[1];
		}
		this.pipelineConfig.pushCommand = 'cf push "${CF_APP}" -p ' + zipPath + ' --hostname "${CF_HOSTNAME}" -d "${CF_DOMAIN}"';
	}

	_configureSpring() {
		let artifactId = this.opts.artifactId ? this.opts.artifactId : "java-spring";
		let version = this.opts.version ? this.opts.version : "1.0-SNAPSHOT";
		
		this.cfIgnoreContent = ['/.classpath', '/.project', '/.settings', '/src/main/resources/application-local.properties', 'target/', 'build/'];
		this.manifestConfig.buildpack = 'java_buildpack';
		this.manifestConfig.memory = this._getHighestMemorySize(this.manifestConfig.memory, '1024M');
		let buildDir = (this.opts.buildType && this.opts.buildType === 'gradle') ? 'build/libs' : 'target';
		let jarPath = `${buildDir}/` + artifactId + `-` + version + `.jar`;
		console.log ("**** jarPath " + jarPath)
		this.manifestConfig.path = `./${jarPath}`;
		this.pipelineConfig.pushCommand = 'cf push "${CF_APP}" -p ' + jarPath + ' --hostname "${CF_HOSTNAME}" -d "${CF_DOMAIN}"';
	}

	_configurePython() {
		// buildpack is left blank; bluemix will auto detect
		this.manifestConfig.buildpack = 'python_buildpack';
		this.manifestConfig.command = this.opts.enable ?
			'echo No run command specified in manifest.yml' :
			'python manage.py start 0.0.0.0:$PORT';
		this.manifestConfig.memory = this.manifestConfig.memory || '128M';
		this.manifestConfig.env.FLASK_APP = 'server';
		this.manifestConfig.env.FLASK_DEBUG = 'false';
		this.cfIgnoreContent = ['.pyc', '.egg-info'];
	}

	_configureDjango() {
		// buildpack is left blank; bluemix will auto detect
		this.manifestConfig.buildpack = 'python_buildpack';
		this.manifestConfig.command = this.opts.enable ?
			'echo No run command specified in manifest.yml' :
			`gunicorn --env DJANGO_SETTINGS_MODULE=${this.bluemix.name}.settings.production ${this.bluemix.name}.wsgi -b 0.0.0.0:$PORT`;
		this.manifestConfig.memory = this.manifestConfig.memory || '128M';
		this.cfIgnoreContent = ['.pyc', '.egg-info'];
	}

	cleanUpPass() {
		if (this.manifestConfig && this.manifestConfig.env && Object.keys(this.manifestConfig.env).length < 1) {
			delete this.manifestConfig.env;
		}
		if (this.cfIgnoreContent) {
			this.cfIgnoreContent = this.cfIgnoreContent.join('\n');
		}
	}

	writing() {
		//skip writing files if platforms is specified via options and it doesn't include bluemix
		if (this.opts.platforms && !this.opts.platforms.includes('bluemix')) {
			return;
		}
		// write manifest.yml file
		this._writeHandlebarsFile('manifest_master.yml', 'manifest.yml', this.manifestConfig)

		// if cfIgnnoreContent exists, create/write .cfignore file
		if (this.cfIgnoreContent) {
			this.fs.write('.cfignore', this.cfIgnoreContent);
		}

		// create .bluemix directory for toolchain/devops related files
		this._writeHandlebarsFile('toolchain_master.yml', '.bluemix/toolchain.yml', {
			name: this.opts.toolchainName || this.name,
			org: this.opts.deploymentOrg || "{{organization}}",
			space: this.opts.deploymentSpace || "{{space}}",
			region: this.opts.deploymentRegion || "{{region}}",
			repoType: this.toolchainConfig.repoType,
			deployment: this.deployment
		});

		this._writeHandlebarsFile('deploy_master.json', '.bluemix/deploy.json', {
			deployment: this.deployment
		});

		this._writeHandlebarsFile('container_build.sh', '.bluemix/scripts/container_build.sh', {
			deployment: this.deployment
		});

		this._writeHandlebarsFile('kube_deploy.sh', '.bluemix/scripts/kube_deploy.sh', {
			deployment: this.deployment
		});

		if (Utils.sanitizeAlphaNumLowerCase(this.deployment.type) === "vsi") {
			this._writeHandlebarsFile('vsi_pipeline_master.yml', '.bluemix/pipeline.yml', {
				config: this.pipelineConfig,
				name: this.name,
				lowercaseName: Utils.sanitizeAlphaNumLowerCase(this.name),
				deployment: this.deployment
			});
		}
		else {
			this._writeHandlebarsFile('pipeline_master.yml', '.bluemix/pipeline.yml', {
				config: this.pipelineConfig,
				deployment: this.deployment,
				manifest: this.manifestConfig
			});
		}

	}

	_writeHandlebarsFile(templateFile, destinationFile, data) {
		let template = this.fs.read(this.templatePath(templateFile));
		let compiledTemplate = Handlebars.compile(template);
		let output = compiledTemplate(data);
		this.fs.write(this.destinationPath(destinationFile), output);
	}
};
