import React, { Component } from 'react';
import Taro from '@tarojs/taro';
import { View, Text, Button } from '@tarojs/components';
import './index.less';

const fileSystemManager = Taro.getFileSystemManager();

function base64Encode(str) {
	if (/([^\u0000-\u00ff])/.test(str)) throw Error('String must be ASCII');

	var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
	var o1, o2, o3, bits, h1, h2, h3, h4, e = [],
		pad = '',
		c;

	c = str.length % 3; // pad string to length of multiple of 3
	if (c > 0) {
		while (c++ < 3) {
			pad += '=';
			str += '\0';
		}
	}
	// note: doing padding here saves us doing special-case packing for trailing 1 or 2 chars

	for (c = 0; c < str.length; c += 3) { // pack three octets into four hexets
		o1 = str.charCodeAt(c);
		o2 = str.charCodeAt(c + 1);
		o3 = str.charCodeAt(c + 2);

		bits = o1 << 16 | o2 << 8 | o3;

		h1 = bits >> 18 & 0x3f;
		h2 = bits >> 12 & 0x3f;
		h3 = bits >> 6 & 0x3f;
		h4 = bits & 0x3f;

		// use hextets to index into code string
		e[c / 3] = b64.charAt(h1) + b64.charAt(h2) + b64.charAt(h3) + b64.charAt(h4);
	}
	str = e.join(''); // use Array.join() for better performance than repeated string appends

	// replace 'A's from padded nulls with '='s
	str = str.slice(0, str.length - pad.length) + pad;

	return str;
}

function toBytesInt32(num) {
	const arr = new ArrayBuffer(4); // an Int32 takes 4 bytes
	const view = new DataView(arr);
	view.setUint32(0, num, false); // byteOffset = 0; litteEndian = false
	return arr;
}

function arrayBufferToString(arr) {
	return String.fromCharCode(...new Uint8Array(arr));
}

export default class Index extends Component {
	state = {
		status: 'Pending...',
		statusCode: 0 //0: Pending 1: Recording 2: Sending file 3: Paused
	};

	showErrMsg = ({ errMsg }) => {
		Taro.showModal({
			title: 'Error',
			content: errMsg,
			showCancel: false
		})
	}

	sendRequest = (filePath) => {
		fileSystemManager.readFile({
			filePath,
			success: (({ data }) => {
				const content = data;
				Taro.connectSocket({
					url: 'ws://47.101.160.77:4004/freetalk/stream/upload'
				}).then(task => {
					const meta = base64Encode(JSON.stringify({
						reqId: "",
						itemFlag: 0,
						reqTag: "",
						appId: "lls",
						appVer: 2,
						deviceId: "d4b5d479862872ba9aa0d962bf7fd56dd4ca70d3",
						sDeviceId: "d4b5d479862872ba9aa0d962bf7fd56dd4ca70d3",
						token: "02abdfb0231d0133bdc802a2643653bc",
						quality: -1,
						type: "chatbot",
						qId: ""
					}));

					task.onOpen(() => {
						this.setState({ status: 'Sending file...', statusCode: 2 });
						task.send({ data: toBytesInt32(meta.length) });
						task.send({ data: meta });
						task.send({ data: content });
						task.send({ data: 'EOS' });
					});

					task.onMessage(result => {
						const data = result.data;
						const dataStr = arrayBufferToString(data.slice(4));
						const resultURL = JSON.parse(dataStr).result;
						this.setState({ status: `Result URL: ${resultURL}`, statusCode: 0 });
					});

					task.onError(this.showErrMsg);
				}).catch(this.showErrMsg);
			}),
			fail: this.showErrMsg
		});
	}

	handleFileUpload = () => {
		if (this.state.statusCode) return;
		Taro.chooseMessageFile({
			count: 1,
			type: 'file',
			extension: ['.wav', '.pcm'],
		}).then(({ tempFiles }) => this.sendRequest(tempFiles[0].path))
			.catch(() => { });
	}

	handleAudioRecord = () => {

		const recorderManager = Taro.getRecorderManager();

		recorderManager.onStart(() => {
			this.setState({ status: 'Recording...', statusCode: 1 });
		})

		recorderManager.onPause(() => {
			this.setState({ status: 'Paused...', statusCode: 3 });
		})

		recorderManager.onResume(() => {
			this.setState({ status: 'Recording...', statusCode: 1 });
		})

		recorderManager.onError(this.showErrMsg);
		recorderManager.onStop(({ tempFilePath }) => this.sendRequest(tempFilePath));

		if (this.state.statusCode == 0) {
			const options = {
				duration: 60000,
				sampleRate: 8000,
				numberOfChannels: 2,
				encodeBitRate: 48000,
				format: 'wav'
			};
			recorderManager.start(options);
		}
		else if (this.state.statusCode == 1)
			recorderManager.stop();
	}

	render() {
		return (
			<View className="index" >
				<Button class="btn" onClick={this.handleFileUpload}>
					选择音频文件...
				</Button>
				<Button class="btn" onClick={this.handleAudioRecord}>
					{this.state.statusCode == 1 ? '停止录制' : '录制音频'}
				</Button>
				<Text className="status" selectable={true}>
					{this.state.status}
				</Text>
				<Text className="notice">
					注意：由于微信小程序不支持直接从本地中选取音频文件, 所以请先通过文件传输助手将文件上传后，再点击“选择音频文件”来选择文件。
				</Text>
			</View>
		)
	}
}
