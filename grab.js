/*
	Zhihu Senior Students Finder
	grab.js - grab users by "Following"

	[Soha King](https://soha.moe) from
		[Tianhai IT](http://tianhai.info)
*/

const request=require('request');
const diskdb=require('diskdb');
const cheerio=require('cheerio');
const async=require('async');

const keywords=['(初|高)(一|二|三)','(初|高)中(学生|生|狗)','(98|99|00|01|02|03|零零|蛋蛋|双零|双蛋|零一|零二|零三)后','千禧年','(14|15|16|17|18|19|十四|十五|十六|十七|十八|十九)岁'];
const requestHeaders={
	'Connection': 'keep-alive',
	'User-Agent': 'ZhihuFinder/1.0.0 Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/57.0.2987.19 Safari/537.36'
};
const baseUrl="https://www.zhihu.com";

let db=diskdb.connect('./db',['judgeQueue','queue']);

let startFrom=process.argv.slice(2)[0];

function judgeAndQueue(fields,db){
	let count=0;
	let keyin=[];
	let findingfields=[
		fields.description,
		fields.headline
	];
	let shouldBeAbove={

	};
	for(var j in findingfields){
		if(typeof(findingfields[j])=='string'){
			for(var i in keywords){
				let regex=new RegExp(keywords[i]);
				let result=findingfields[j].match(regex);
				if(result){
					count++;
					keyin.push(result[0]);
				}
			}
		}
	}
	if(count>0){
		let dt=fields;
		dt.finder={
			keywords: keyin,
			count: count
		}
		var isExist=db.find({
			username: dt.username
		});
		if(isExist.length==0){
			db.save(dt);
		}
		return(dt);
	}else{
		return(false);
	}
}

function extractInformation(theuser){
	return({
		username: theuser.urlToken,
		name: theuser.name,
		description: theuser.description ? theuser.description.replace(new RegExp('<br>','g'),"\n") : theuser.description,
		headline: theuser.headline ? theuser.headline.replace(new RegExp('<br>','g'),"\n") : theuser.headline,
		gender: theuser.gender,
		url: theuser.url,
		avater: theuser.avatarUrl,
		numbers: {
			answers: parseInt(theuser.answerCount),
			posts: parseInt(theuser.pinsCount),
			questions: parseInt(theuser.questionCount),
			collections: parseInt(theuser.favoritedCount),
			articles: parseInt(theuser.articlesCount),
			voteup: parseInt(theuser.voteupCount),
			thanks: parseInt(theuser.thankedCount),
			faviorited: parseInt(theuser.favoritedCount),
			publicEditing: parseInt(theuser.logsCount),
			following: parseInt(theuser.followingCount),
			follower: parseInt(theuser.followerCount),
			followingColumns: parseInt(theuser.followingColumnsCount),
			followingCollections: parseInt(theuser.followingFavlistsCount),
			followingTopics: parseInt(theuser.followingTopicCount),
			followingQuestions: parseInt(theuser.followingQuestionCount)
		}
	});
}

function analyzeUserData(usersArray,thisuser){
	var retData=[];
	retData.push(extractInformation(usersArray[thisuser]));
	delete usersArray[thisuser];
	for(var i in usersArray){
		if(usersArray.hasOwnProperty(i)){
			retData.push(extractInformation(usersArray[i]));
		}
	}
	return(retData);
}

function crawl(userid,page,cb){
	request({
		url: baseUrl+'/people/'+userid+'/following'+'?page='+page,
		headers: requestHeaders
	},function (err,res,data){
		if(res.statusCode==200){
			let $=cheerio.load(data);
			let dataState=JSON.parse($('div#data').attr('data-state'));
			let usersArray=dataState.entities.users;
			let usersdata=analyzeUserData(usersArray,userid);
			let pages=parseInt($('button.PaginationButton:not(.PaginationButton-next)').last().text());
			pages=(pages>0) ? pages : 1;
			if(cb){
				cb(usersdata,pages);
			}
		}else{
			console.log('No user (banned or deleted): '+userid);
			if(cb){
				cb([],0);
			}
		}
	});
}

if(db.judgeQueue.count()==0 && startFrom!=''){
	db.judgeQueue.save({
		username: startFrom,
		status: 0
	});
}
async.whilst(function (){
	return(db.judgeQueue.count()!=0);
},function (callback){
	let a=db.judgeQueue.findOne({
		status: 0
	});
	if(a){
		let currentSearch=a.username;
		crawl(currentSearch,1,function (data,page){
			var currentPage=0;
			async.whilst(function (){
				return(currentPage<page);
			},function (callback){
				currentPage++;
				crawl(currentSearch,currentPage,function (data,page){
					for(var i in data){
						if(data.hasOwnProperty(i)){
							if(judgeAndQueue(data[i],db.queue)){
								if(db.judgeQueue.find({
									username: data[i].username
								}).length==0){
									console.log(data[i].username);
									db.judgeQueue.save({
										username: data[i].username,
										status: 0
									});
								}
							}
						}
					}
					callback(null,currentPage);
				});
			},function (err,n){
				db.judgeQueue.update({
					username: currentSearch
				},{
					username: currentSearch,
					status: 1
				},{
					multi: true
				});
				callback(null);
			});
		});
	}else{
		callback('Following network ended.');
	}
},function (err){
	console.log(err);
});