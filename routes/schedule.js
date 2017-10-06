var request = require('request');
var url = require('url');
var cheerio = require('cheerio');
var dbconfig = require('../config/dbconfig.js');
var mysql = require('mysql');
var dbconnection = mysql.createConnection(dbconfig);
module.exports = function(event){
    var accept_url = 'https://servizionline.comune.palermo.it/portcitt/pu/push-appuntamentopubb.do?nomeTabella=FOUTRPOR_APPUNTAMENTOPUBB&SER_COD=1084&ARECOD=10';
    var main_url = 'https://servizionline.comune.palermo.it/portcitt/jsp/home.jsp?modo=info&info=servizi.jsp&ARECOD=10&SERCOD=1084&sportello=portcitt';
    const user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36';
    var option = { url:main_url, headers: { 'User-Agent':user_agent }};
    var office_id = 0;
    request(option,function(err, httpResponse, body){
        if(err){
            return console.error('call failed',err);
        }
        cookie = httpResponse.headers['set-cookie'][0];
        option = { url:accept_url, headers: {'User-Agent':user_agent,'Cookie': cookie}};
        request(option,function(err, httpResponse, body){
            var $ = cheerio.load(body);
            var alloptions = $('#APD_COD').children('option').length -1;
            $('#APD_COD').children('option').each(function(key, obj){
                if(key != 0){
                    // 현재 등록되여잇는 오피스 인지를 확인한다.
                    var temp_name = $(this).text();
                    sql = "SELECT * FROM offices WHERE office_name='" + temp_name + "' AND office_value='" + obj.attribs.value + "'";
                    dbconnection.query(sql, function(err, rows){
                        if(err) return console.error('db select command:',err);                        
                        if(rows.length == 0){
                            // 등록되여 있는 오피스가 아니라면 새로 등록한다.
                            sql = "INSERT INTO offices(office_name, office_value) VALUES ('" + temp_name + "','"  + obj.attribs.value + "')";                        
                        }
                        else{
                            //등록되여 있는 오피스 라면 업데이트 한다.
                            office_id = rows[0].id;
                            sql = "UPDATE offices SET office_name='" + temp_name + "', office_value='" + obj.attribs.value + "' WHERE id=" + office_id;                            
                        }
                        dbconnection.query(sql, function(err, rows){
                            if(err) return console.error('db insert command erro', err);  
                        });                        
                        //매개 오피스에대한 날자 정보를 얻어온다.
                        var date_url = "https://servizionline.comune.palermo.it/portcitt/aj/aj-get-disponibilita-gg-appuntamenti.do?apdCod=" +obj.attribs.value;
                        option = { url:date_url, method:'GET', headers: {'User-Agent':user_agent,'Cookie': cookie}};
                        console.log("requesting office_dates....");
                        request(option,function(err, httpResponse, body){
                            if(err){
                                return console.error('date office reqeust failed', err);                                            
                            }
                            var office_times = JSON.parse(body);                         
                            office_times.forEach(function(element) {
                                sql = "SELECT * FROM offices_dates WHERE office_value=" + obj.attribs.value + " AND date_value='" + element + "'";
                                dbconnection.query(sql, function(err, rows){
                                    if(err){
                                        return console.error('date table select command error:', err);
                                    }
                                    if(rows.length == 0){
                                        // 등록되여 있는 오피스가 아니라면 새로 등록한다.
                                        sql = "INSERT INTO offices_dates(office_value, date_value) VALUES ('" + obj.attribs.value + "','"  + element + "')";
                                    }else{                                        
                                        sql = "UPDATE offices_dates SET office_value='" + obj.attribs.value + "', date_value='" + element + "' WHERE id=" + rows[0].id;
                                    }
                                    dbconnection.query(sql, function(err, rows){
                                        if(err){
                                            return console.error('offices_dates table command error: ', err);
                                        }                                        
                                         //매개 날자에 대한 시간 정보를 얻어 온다.
                                        console.log("requesting office_dates_times....");                                
                                        var time_url = "https://servizionline.comune.palermo.it/portcitt/aj/aj-get-disponibilita-appuntamenti.do?dataAppuntamento="+ element +"&apdCod=" +obj.attribs.value;
                                        option = { url:time_url, method:'GET', headers: {'User-Agent':user_agent,'Cookie': cookie}};
                                        request(option, function(err, httpResponse, body){
                                            if(err){
                                                return console.error('office_dates_time reqeusting failed', err);                                            
                                            }
                                            sql = "UPDATE offices_dates SET time_value='" + body + "' WHERE date_value='" + element + "'";
                                            dbconnection.query(sql, function(err, rows){                                                
                                                if(err){
                                                    return console.error('date table select command error:', err);
                                                }
                                                if(alloptions == key){
                                                    console.log("completed!");
                                                }
                                            });
                                        })                                     
                                    })
                                });
                            }, this);                          
                        })
                    })                     
                }
            })
        })
        
    });
}