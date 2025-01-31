var debug = require('debug')('verbs:auth')
var verb_utils = require('./verb_utils')
var pgp = require('pg-promise')()
var config = require('../../config')

var pool = verb_utils.pool 
var pool_mallas = verb_utils.pool_mallas 

let dic_taxon_data = new Map();
dic_taxon_data.set('especievalidabusqueda','{"reino":"\'||reinovalido||\'","phylum":"\'||phylumdivisionvalido||\'","clase":"\'||clasevalida||\'","orden":"\'||ordenvalido||\'", "familia":"\'||familiavalida||\'", "genero":"\'||generovalido||\'", "especie":"\'||especievalidabusqueda||\'"}')
dic_taxon_data.set('generovalido','{"reino":"\'||reinovalido||\'","phylum":"\'||phylumdivisionvalido||\'","clase":"\'||clasevalida||\'","orden":"\'||ordenvalido||\'", "familia":"\'||familiavalida||\'", "genero":"\'||generovalido||\'"}')
dic_taxon_data.set('familiavalida','{"reino":"\'||reinovalido||\'","phylum":"\'||phylumdivisionvalido||\'","clase":"\'||clasevalida||\'","orden":"\'||ordenvalido||\'", "familia":"\'||familiavalida||\'"}')
dic_taxon_data.set('ordenvalido','{"reino":"\'||reinovalido||\'","phylum":"\'||phylumdivisionvalido||\'","clase":"\'||clasevalida||\'","orden":"\'||ordenvalido||\'"}')
dic_taxon_data.set('clasevalida','{"reino":"\'||reinovalido||\'","phylum":"\'||phylumdivisionvalido||\'","clase":"\'||clasevalida||\'"}')
dic_taxon_data.set('phylumdivisionvalido','{"reino":"\'||reinovalido||\'","phylum":"\'||phylumdivisionvalido||\'"}')
dic_taxon_data.set('reinovalido','{"reino":"\'||reinovalido||\'"}')


let dic_taxon_group = new Map();
dic_taxon_group.set('especievalidabusqueda','especievalidabusqueda, reinovalido, phylumdivisionvalido, clasevalida, ordenvalido, familiavalida, generovalido')
dic_taxon_group.set('generovalido','generovalido, reinovalido, phylumdivisionvalido, clasevalida, ordenvalido, familiavalida')
dic_taxon_group.set('familiavalida','familiavalida, reinovalido, phylumdivisionvalido, clasevalida, ordenvalido')
dic_taxon_group.set('ordenvalido','ordenvalido, reinovalido, phylumdivisionvalido, clasevalida')
dic_taxon_group.set('clasevalida','clasevalida, reinovalido, phylumdivisionvalido')
dic_taxon_group.set('phylumdivisionvalido','phylumdivisionvalido, reinovalido')
dic_taxon_group.set('reinovalido','reinovalido')

let valid_filters = ["levels_id","reino","phylum","clase","orden","familia","genero","especie"]

let dic_taxon_db = new Map();
dic_taxon_db.set('levels_id','spid')
dic_taxon_db.set('especie','especievalidabusqueda')
dic_taxon_db.set('genero','generovalido')
dic_taxon_db.set("familia",'familiavalida')
dic_taxon_db.set('orden','ordenvalido')
dic_taxon_db.set('clase','clasevalida')
dic_taxon_db.set('phylum','phylumdivisionvalido')
dic_taxon_db.set('reino','reinovalido')

exports.variables = function(req, res) {

	let { } = req.body;

	// Se recomienda agregar la columna available_grids a este catalogo con ayuda de los servicios disponibles del proyecto regionmiddleware
	pool.any(`SELECT id, description as variable, level_size, filter_fields, available_grids
			FROM cat_taxonv3 order by id;`, {}).then( 
		function(data) {
			// debug(data);
		res.status(200).json({
			data: data
		})
  	})
  	.catch(error => {
      debug(error)
      res.status(403).json({
      	message: "error al obtener catalogo", 
      	error: error
      })
   	});
}


exports.get_variable_byid = function(req, res) {

	let variable_id = req.params.id
	debug("variable_id: " + variable_id)

	let q = verb_utils.getParam(req, 'q', '')
	let offset = verb_utils.getParam(req, 'offset', 0)
	let limit = verb_utils.getParam(req, 'limit', 10)

	debug("q: " + q)
	debug("offset: " + offset)
	debug("limit: " + limit)

	let query_array = []
	
	let filter_separator = ";"
	let pair_separator = "="
	let group_separator = ","

	// q: "levels_id = 310245,265492; familia = Acanthaceae"
	
	if(q != ""){

		let array_queries = q.split(filter_separator)
		debug(array_queries)

		if(array_queries.length == 0){
			debug("Sin filtros definidos")
		}
		else{
			array_queries.forEach((filter, index) => {

				let filter_pair = filter.split(pair_separator)
				debug(filter_pair)

				if(filter_pair.length == 0){
					debug("Filtro indefinido")
				}
				else{
					
					let filter_param = filter_pair[0].trim()
					// debug("filter_param: " + filter_param)

					// TODO:Revisar por que no jala en enalce del mapa con su llave valor
					// debug(dic_taxon_db.keys())
					// debug("dic_taxon_db: " + dic_taxon_db.get(filter_param))
					

					if(valid_filters.indexOf(filter_param) == -1){
						debug("Filtro invalido")
					}
					else{
						
						if(filter_pair.length != 2){
							debug("Filtro invalido por composición")
						}
						else{
							let filter_value = filter_pair[1].trim().split(group_separator)	
							
							let query_temp = "( "
							filter_value.forEach((value, index) => {

								if(filter_param !== "levels_id"){
									value = "'" + value + "'"
								}
								
								if(index == 0){
									query_temp = query_temp + dic_taxon_db.get(filter_param) + " = " + value
								}
								else{
									query_temp = query_temp + " or " + dic_taxon_db.get(filter_param) + " = " + value + " "
								}

							})
							query_temp = query_temp + " )"
							query_array.push(query_temp)

						}

					}

				}

			})	

			debug(query_array)

		}

	}


	pool.task(t => {

		return t.one(
			"select id, column_taxon from cat_taxonv3 where id = $<variable_id:raw>", {
				variable_id: variable_id
			}	
		).then(resp => {

			let column_taxon = resp.column_taxon
			debug("column_taxon: " + column_taxon)

			let id = resp.id
			debug("id variable: " + id)

			let query = `select $<id:raw> as id, array_agg(spid) as level_id, ('$<dic_taxon_data:raw>')::json as datos
				from sp_snibv3
				where $<column_taxon:raw> <> '' {queries}
				group by $<dic_taxon_group:raw>
				order by $<column_taxon:raw>
				offset $<offset:raw>
				limit $<limit:raw>`

			query_array.forEach((query_temp, index) => {
				
				query = query.replace("{queries}", " and " + query_temp + " {queries} ")

			})

			query = query.replace("{queries}", "")
			query = query.replace(/levels_id/g, "spid")
			
			debug(query)
				
			return t.any(query, {
					id: id,
					column_taxon:column_taxon,
					dic_taxon_data:dic_taxon_data.get(column_taxon),
					dic_taxon_group: dic_taxon_group.get(column_taxon),
					offset: offset,
					limit: limit
				}	

			).then(resp => {

				res.status(200).json({
					data: resp
				})

			}).catch(error => {
		      debug(error)
		      res.status(403).json({
		      	error: "Error al obtener la malla solicitada", 
		      	message: "error al obtener datos"
		      })
		   	})

		}).catch(error => {
	      debug(error)

	      res.status(403).json({	      	
	      	error: "Error al obtener la malla solicitada", 
	      	message: "error al obtener datos"
	      })
	   	})

	}).catch(error => {
      debug(error)
      res.status(403).json({
      	message: "error general", 
      	error: error
      })
   	});
  	
}


exports.get_data_byid = function(req, res) {

	let id = req.params.id
	debug("id: " + id)

	let grid_id = verb_utils.getParam(req, 'grid_id', 1)
	debug("grid_id: " + grid_id)

	let levels_id = verb_utils.getParam(req, 'levels_id', [])
	debug("levels_id: " + levels_id)

	let filter_names = verb_utils.getParam(req, 'filter_names', [])
	debug(filter_names)

	let filter_values = verb_utils.getParam(req, 'filter_values', [])
	debug(filter_values)

	// TODO: validaciones para verificar los filtros
	let filter_array = []

	if(filter_names.length > 0){
		filter_names.forEach((filter_name, index) => {
			let filter_temp = {}
			filter_temp = {filter_param: filter_name, filter_value: filter_values[index]}
			filter_array.push(filter_temp)
		})
	}
	// debug(filter_array)
	
	pool.task(t => {

		let query = `select spid, array_agg(st_astext(the_geom)) as points 
				from snib s
				where spid in ($<spids:raw>)  
				and the_geom is not null {in_fosil} {in_sin_fecha}
				group by spid {min_occ}`
		
		filter_array.forEach((filter_item) => {

			let filter_query = ""

			switch (filter_item.filter_param) {
			    
			    case "min_occ":
			        debug("min_occ");

					filter_query = " having array_length(array_agg(st_astext(the_geom)),1) > " + filter_item.filter_value + " "
					query = query.replace("{min_occ}", filter_query)
			        
			        break;

			    case "in_fosil":
			        debug("Incluir registros fosil");

			        if(filter_item.filter_value){
			        	filter_query = " "	
			        }
			        else{
			        	filter_query = " and ejemplarfosil = 'NO' "		
			        }

					query = query.replace("{in_fosil}", filter_query)
			        
			        break;

			    case "in_sin_fecha":
			    	debug("Incluir registros sin fecha");

			    	if(filter_item.filter_value){
			        	filter_query = " "
			        }
			        else{
			        	// filter_query = " and (fechacolecta is not null and fechacolecta <> '9999-99-99') "
			        	filter_query = " and fechacolecta is not null "
			        }

			        query = query.replace("{in_sin_fecha}", filter_query)
			        
			        break;

			    default:
			        console.log("Filtro no valido: " + filter_item.filter_param);
			}
			
		})

		query = query.replace("{min_occ}", "")
		query = query.replace("{in_fosil}", "")
		query = query.replace("{in_sin_fecha}", "")

		// debug("query: " + query)

		return t.any(query, {
				spids: levels_id.toString()
			}	
		).then(resp => {

			let datapoints = resp
			let response_array = []
			let cells = []
			let query_array = []

			if (datapoints == null || datapoints.length == 0) {

				response_array.push({
					id: id,
					grid_id: grid_id,
					cells: [],
					n: 0,
					message: "No hay datos para esta solicitud"
				})

				res.status(404).json(
					response_array
				)

			}

			datapoints.forEach((points_byspid) => {
				
				let query_temp = ""
				let query_points = ""

				if(points_byspid.points == null || points_byspid.points.length == 0){
					debug("el " + points_byspid.spid + " no tiene occurrencias registradas")
					return
				}

				points_byspid.points.forEach((point, index) => {

					if(index==0){
						query_points = query_points + " ST_SetSRID(ST_GeomFromText('" + point + "'), 4326)"	
					}
					else{
						query_points = query_points + ", ST_SetSRID(ST_GeomFromText('" + point + "'), 4326)"
					}
					
				})

				query_temp = `WITH puntos AS (
					    SELECT ARRAY[{query_points}] AS geom_array
					),
					point_geom as (
						SELECT unnest(geom_array) as geom 
						from puntos as p
					)
					select g.gridid_64km as cell
					from point_geom as p
					join grid_64km_aoi as g 
					ON ST_Intersects(g.the_geom, p.geom);`

				query_temp = query_temp.replace("{query_points}", query_points)
				query_array.push({query_temp: query_temp, spid: points_byspid.spid}) 
				
			})

			// debug(query_array)

			
			// contrucción de respuesta
			let peticiones = query_array.length
			

			query_array.forEach((query_str) => {

				pool_mallas.task(t => {

					return t.any(
						query_str.query_temp, {}	
					).then(resp => {

						// enviando respuesta hasta que se reciban todas las peticiones del array
						peticiones = peticiones - 1

						// agrupacion de celdas de la respuesta del query
						let cells = resp.map(obj => {
						  return obj.cell
						});

						response_array.push({
							id: id,
							grid_id: grid_id,
							level_id: query_str.spid,
							cells: cells,
							n: cells.length
						})

						if(peticiones == 0){
							res.status(200).json(
								response_array
							)
						}
						
						
					})
				}).catch(error => {
			      debug(error)
			      peticiones = peticiones - 1
			      // res.status(403).json({
			      // 	message: "error general", 
			      // 	error: error
			      // })
			   	});

			})
			

		}).catch(error => {
	      debug(error)

	      res.status(403).json({	      	
	      	error: "Error al obtener la malla solicitada", 
	      	message: "error al obtener datos"
	      })
	   	})


	}).catch(error => {
      debug(error)
      res.status(403).json({
      	message: "error general", 
      	error: error
      })
   	});	
  	
}
