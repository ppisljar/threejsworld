// see http://callum.com for more stuff.
var camera, scene, renderer;
var controls, gui, stats;
var point_cloud;
var point_cloud_material;
var start_lat = 45.9575618;
var start_lng = 14.0922093;
var max_sv_distance = 80;
var base_lat = start_lat;
var base_lng = start_lng;
var all_pano_ids = [];
var svs = new google.maps.StreetViewService();
var geo_coder = new google.maps.Geocoder();
var stack = 0;
var map = 0;
var point_size = 0.2;
var show_map = true;
var num_points_str = "Loading...";
var preset_location = "";
var geocode_location = "";
var point_step = 2;
var mycb = null;
function init(cb) {

    mycb = cb;


    point_cloud_material = new THREE.PointCloudMaterial({
        size: point_size,
        vertexColors: THREE.VertexColors
    });


    regenerate_view();
}

function regenerate_view() {

    all_pano_ids = [];

    if (point_cloud) {
        mainScene.remove(point_cloud);
    }

    get_sv_id_by_location((config.TL[0]+config.BR[0])/2,(config.TL[1]+config.BR[1])/2);
}


function distanceTo() {
    return 1;
}

var _elevationService = new google.maps.ElevationService();

Number.prototype.toRad = function() {
    return this * Math.PI / 180;
};

Number.prototype.toDeg = function() {
    return this * 180 / Math.PI;
};

var pointOnLine = function(t, a, b) {
    var lat1 = a.lat().toRad(), lon1 = a.lng().toRad();
    var lat2 = b.lat().toRad(), lon2 = b.lng().toRad();

    x = lat1 + t * (lat2 - lat1);
    y = lon1 + t * (lon2 - lon1);

    return new google.maps.LatLng(x.toDeg(), y.toDeg());
};


function get_sv_id_by_location(lng, lat) {

    base_lat = lat;
    base_lng = lng;
    loadJSON('../data/path.json', function(path) {

        for (var x = 0; x < path.length; x++) {
             all_pano_ids.push(path[x].panoid);
        }

        create_point_cloud();

    });
}

var lastx = 0, lasty = 0;
function move_point_cloud(x, y) {
    for (var i = 0; i < positions.length; i+=3) {
        positions[i+0] += x-lastx;
        positions[i+2] += y-lasty;
    }
    lastx = x;
    lasty = y;

    mainScene.remove(point_cloud);
    geometry = new THREE.BufferGeometry();
    geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.addAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingBox();
    point_cloud = new THREE.PointCloud(geometry, point_cloud_material);
    mainScene.add(point_cloud);
}

var num_points = 0;
var axis = new THREE.Vector3(0, -1, 0);
var geometry = 0;
var positions = 0;
var colors = 0;
var cur_depth_elem = 0;
var cur_pano_elem = 0;
var depthmap_width = 0;
var depthmap_height = 0;
var pano_promises = [];
var depth_promises = [];
function create_point_cloud() {



    for (var n = 0; n < all_pano_ids.length; ++n) {

        (function(n) {
            var depth_promise = new Promise(function (resolve, reject) {
                var ii = ("000000000" + n);
                loadJSON('../data/' + ii.substr(ii.length - 5) + "-" + all_pano_ids[n] + '.depth', function (data) {

                        var self = data;


                        console.log("Loaded depth data", cur_depth_elem + 1, "of", all_pano_ids.length + " [" + n + "] elevation: " + self.elevation + "lat/lng: " + self.data.Location.lat + "," + self.data.Location.lng);

                        if (geometry === 0) {

                            depthmap_width = self.depthMap.width;
                            depthmap_height = self.depthMap.height;

                            geometry = new THREE.BufferGeometry();
                            num_points = all_pano_ids.length *
                                depthmap_width *
                                depthmap_height /
                                (point_step * point_step);
                            num_points_str = num_points.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                            positions = new Float32Array(num_points * 3);
                            colors = new Float32Array(num_points * 3);
                        }

                        var base_offset = n * depthmap_width * depthmap_height / (point_step * point_step);

                        var rotation = self.data.Projection.pano_yaw_deg;
                        var actual_lat = self.data.Location.lat;
                        var actual_lng = self.data.Location.lng;

                        var lat_diff = lat_lng_diff(base_lat, base_lng, actual_lat, base_lng);
                        var lng_diff = lat_lng_diff(base_lat, base_lng, base_lat, actual_lng);
                        var lat_sign = (base_lat - actual_lat) < 0.0 ? -1 : +1;
                        var lng_sign = (base_lng - actual_lng) < 0.0 ? -1 : +1;
                        var offset_z = lat_diff * lat_sign;
                        var offset_y = 800;
                        var offset_x = lng_diff * -lng_sign;
                        //if (Math.abs(offset_x) < mapWidth / 2 && Math.abs(offset_z) < mapHeight / 2) offset_y = terrainGeom.getTerrainHeight(offset_x, offset_z);

                        var rot_y = (rotation) * Math.PI / 180.0;

                        //var off_diff_x = offset_x - previous.x;
                        //var off_diff_y = offset_y - previous.y;

                        for (var y = 0, num = 0; y < depthmap_height; y += point_step) {

                            var lat = (y / depthmap_height) * 180.0 - 90.0;
                            var r = Math.cos(lat * Math.PI / 180.0);

                            for (var x = 0; x < depthmap_width; x += point_step) {


                                var depth = config.sizeRatio * parseFloat(self.depthMap.depthMap[y * depthmap_width + depthmap_width - x]);

                                var lng = (1 - (x / depthmap_width)) * 360.0 - 180.0;
                                var pos = new THREE.Vector3();
                                // - na x in z prezrcali sliko (ampak se meri pase/ne skupi ... pot ostane ista (sam luci so na drugi strani ceste)
                                // zamenjam z in x ... 90 stopinj AC
                                pos.z = -(r * Math.cos((lng) * Math.PI / 180.0));
                                pos.y = -(Math.sin(lat * Math.PI / 180.0));
                                pos.x = -(r * Math.sin((lng) * Math.PI / 180.0));
                                pos.multiplyScalar(depth);

                                var matrix = new THREE.Matrix4().makeRotationAxis(axis, rot_y);
                                pos.applyMatrix4(matrix);


                                pos.x += offset_x + params.xoff;// + 3900;
                                pos.z += offset_z + params.yoff;// - 3900;

                                var mapx = pos.x;
                                var mapy = pos.z;

                                if (Math.abs(mapx) > mapWidth / 2 || Math.abs(mapy) > mapHeight / 2) offset_y = 800;
                                else offset_y = terrainGeom.getTerrainHeight(mapx, mapy);


                                /*var ii = Math.round(Math.abs(pos.z*depthmap_width+pos.x));
                                 if (ii >= terrainGeom.vertices.length) ii = 0;
                                 var offset_y =  terrainGeom.getTerrainHeight(mapx, mapy); // 800 //parseFloat(terrainGeom.vertices[ii].z); //-parseFloat(this.elevation); //elevation;
                                 */

                                pos.y += offset_y + 5 * config.sizeRatio;

                                positions[base_offset * 3 + num * 3 + 0] = isNaN(pos.x) ? 0 : pos.x;
                                positions[base_offset * 3 + num * 3 + 1] = isNaN(pos.y) ? 0 : pos.y;
                                positions[base_offset * 3 + num * 3 + 2] = isNaN(pos.z) ? 0 : pos.z;

                                ++num;
                            }
                        }

                        previous = {
                            elevation: offset_y,
                            location: {
                                lat: actual_lat,
                                lng: actual_lng,
                                x: offset_x,
                                y: offset_y
                            }
                        };

                        ++cur_depth_elem;

                        resolve([actual_lat, actual_lng])

                    }
                );
            });
            depth_promises.push(depth_promise);
        })(n);

        var image = new Image();
        image.n = n;

        var pano_promise = new Promise(function(resolve, reject) {


            image.onload = function() {

                console.log("Loaded pano data", cur_pano_elem + 1, "of", all_pano_ids.length + " [" + this.n + "]");

                var canvas = document.createElement("canvas");
                canvas.width = this.width;
                canvas.height = this.height;


                var pano_image_canvas = canvas;
                var pano_image_canvas_context = canvas.getContext('2d');

                pano_image_canvas_context.drawImage(this, 0, 0);

                var color_data = pano_image_canvas_context.getImageData(0, 0, pano_image_canvas_context.canvas.width, pano_image_canvas_context.canvas.height).data;

                var base_offset = this.n * depthmap_width * depthmap_height / (point_step * point_step);

                for (var y = 0, num = 0; y < depthmap_height; y += point_step) {

                    var normalized_y = y / depthmap_height;

                    for (var x = 0; x < depthmap_width; x += point_step) {

                        var normalized_x = (1 - x / depthmap_width);
                        var color_canvas_x = parseInt(normalized_x * pano_image_canvas_context.canvas.width);
                        var color_canvas_y = parseInt(normalized_y * pano_image_canvas_context.canvas.height);
                        var color_index = color_canvas_y * pano_image_canvas_context.canvas.width * 4 + color_canvas_x * 4;
                        colors[base_offset * 3 + num * 3 + 0] = (color_data[color_index + 0]) / 255.0;
                        colors[base_offset * 3 + num * 3 + 1] = (color_data[color_index + 1]) / 255.0;
                        colors[base_offset * 3 + num * 3 + 2] = (color_data[color_index + 2]) / 255.0;

                        ++num;
                    }
                }
                ++cur_pano_elem;

                resolve();
            }
        });

        pano_promises.push(pano_promise);

        var ii = ("000000000" + n);
        image.src = "../data/"+ii.substr(ii.length-5) + "-" + all_pano_ids[n] + ".thumb.png";
    }

    Promise.all(depth_promises).then(
        function(data) {
            console.log("Finished depth:");

            Promise.all(pano_promises).then(
                function(data) {
                    console.log("Finished pano:");




                    geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3));
                    geometry.addAttribute('color', new THREE.BufferAttribute(colors, 3));
                    geometry.computeBoundingBox();
                    point_cloud = new THREE.PointCloud(geometry, point_cloud_material);
                    mainScene.add(point_cloud);

                    if (mycb) mycb();
                }
            );

        }
    );
}

// from: http://www.movable-type.co.uk/scripts/latlong.html
// returns distance (in km) between two coordinates
function lat_lng_diff(lat1, lng1, lat2, lng2) {
    var radius = 6378.137;
    var lat_diff = (lat2 - lat1) * Math.PI / 180;
    var lng_diff = (lng2 - lng1) * Math.PI / 180;
    var arc = Math.sin(lat_diff / 2) * Math.sin(lat_diff / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(lng_diff / 2) * Math.sin(lng_diff / 2);
    var c = 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
    var d = radius * c;
    return d * 1000*config.sizeRatio;
}

